import dns from "dns/promises";
import { VerificationResult, VerificationChecks, BatchVerificationResult, BatchEmailResult, MxRecord } from "../types";
import {
  isValidEmailFormat,
  isDisposable,
  isRoleBasedAddress,
  isFreeProvider,
  getSuggestedDomain,
} from "../utils/validators";
import { verifySmtp, verifySmtpBatch } from "./smtpVerifier";

export async function verifyEmail(email: string): Promise<VerificationResult> {
  const timestamp = new Date().toISOString();
  const [local, domain] = email.split("@");

  const checks: VerificationChecks = {
    format: { passed: false, message: "" },
    mx: { passed: false, message: "" },
    smtp: { passed: false, message: "" },
    disposable: { passed: false, message: "" },
    roleBased: { passed: false, message: "" },
    freeProvider: { passed: false, message: "" },
  };

  const suggestedDomain = domain ? getSuggestedDomain(domain) : null;

  // Format check
  if (!isValidEmailFormat(email)) {
    checks.format = { passed: false, message: "Invalid email format" };
    checks.mx = { passed: false, message: "Skipped" };
    checks.smtp = { passed: false, message: "Skipped" };
    checks.disposable = { passed: true, message: "Skipped" };
    checks.roleBased = { passed: true, message: "Skipped" };
    checks.freeProvider = { passed: true, message: "Skipped" };
    return { email, isValid: false, checks, isCatchAll: false, suggestedDomain, timestamp };
  }

  checks.format = { passed: true, message: "Valid email format" };

  // Disposable check (informational)
  const disposable = isDisposable(domain);
  checks.disposable = disposable
    ? { passed: false, message: `Disposable email domain (${domain})` }
    : { passed: true, message: "Not a disposable email" };

  // Role-based check (informational)
  const roleBased = isRoleBasedAddress(local);
  checks.roleBased = roleBased
    ? { passed: false, message: `Role-based address (${local}@)` }
    : { passed: true, message: "Not a role-based address" };

  // Free provider check (informational)
  const free = isFreeProvider(domain);
  checks.freeProvider = free
    ? { passed: false, message: `Free email provider (${domain})` }
    : { passed: true, message: "Not a free email provider" };

  // MX record check
  let mxRecords: { exchange: string; priority: number }[] = [];
  try {
    const records = await dns.resolveMx(domain);
    mxRecords = records
      .map((r) => ({ exchange: r.exchange, priority: r.priority }))
      .sort((a, b) => a.priority - b.priority);

    if (mxRecords.length > 0) {
      checks.mx = { passed: true, message: "MX records found", records: mxRecords };
    } else {
      checks.mx = { passed: false, message: "No MX records found" };
    }
  } catch (err: any) {
    const code = err?.code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      checks.mx = { passed: false, message: "Domain does not have MX records" };
    } else {
      checks.mx = { passed: false, message: "DNS lookup failed" };
    }
  }

  // SMTP check (only if MX records found)
  let isCatchAll = false;
  if (checks.mx.passed && mxRecords.length > 0) {
    const smtpResult = await verifySmtp(email, mxRecords[0].exchange);
    isCatchAll = smtpResult.isCatchAll;

    if (smtpResult.valid === true) {
      checks.smtp = { passed: true, message: "Mailbox exists" };
    } else if (smtpResult.valid === false) {
      checks.smtp = { passed: false, message: "Mailbox does not exist" };
    } else {
      // Inconclusive — cannot confirm mailbox exists, mark as failed
      checks.smtp = { passed: false, message: smtpResult.message };
    }
  } else {
    checks.smtp = { passed: false, message: "Skipped (no MX records)" };
  }

  // isValid = format + mx + smtp all pass
  const isValid = checks.format.passed && checks.mx.passed && checks.smtp.passed;

  return { email, isValid, checks, isCatchAll, suggestedDomain, timestamp };
}

export async function verifyEmailBatch(emails: string[]): Promise<BatchVerificationResult> {
  const timestamp = new Date().toISOString();
  const domain = emails[0].split("@")[1];

  // Domain-level checks (run once)
  const domainInfo = {
    isDisposable: isDisposable(domain),
    isFreeProvider: isFreeProvider(domain),
    hasMxRecords: false,
    mxRecords: [] as MxRecord[],
  };

  // Filter emails with valid format
  const validFormatEmails: string[] = [];
  const results: BatchEmailResult[] = [];

  for (const email of emails) {
    if (!isValidEmailFormat(email)) {
      results.push({ email, isValid: false, smtp: { passed: false, message: "Invalid email format" } });
    } else {
      validFormatEmails.push(email);
    }
  }

  // MX lookup
  let mxRecords: MxRecord[] = [];
  try {
    const records = await dns.resolveMx(domain);
    mxRecords = records
      .map((r) => ({ exchange: r.exchange, priority: r.priority }))
      .sort((a, b) => a.priority - b.priority);
    domainInfo.hasMxRecords = mxRecords.length > 0;
    domainInfo.mxRecords = mxRecords;
  } catch {
    domainInfo.hasMxRecords = false;
  }

  if (!domainInfo.hasMxRecords || validFormatEmails.length === 0) {
    // No MX records or no valid emails — mark all remaining as failed
    for (const email of validFormatEmails) {
      results.push({ email, isValid: false, smtp: { passed: false, message: "No MX records found" } });
    }
    return { domain, isCatchAll: false, domainInfo, results, validEmail: null, stoppedEarly: false, timestamp };
  }

  // Batch SMTP verification
  const smtpBatch = await verifySmtpBatch(validFormatEmails, mxRecords[0].exchange);

  let stoppedEarly = false;
  for (const email of validFormatEmails) {
    const smtpResult = smtpBatch.results.get(email);
    if (smtpResult) {
      const passed = smtpResult.valid === true; // only explicit success counts as valid
      results.push({ email, isValid: passed && !smtpBatch.isCatchAll, smtp: { passed, message: smtpResult.message } });
    } else {
      // Email was not tested (early exit)
      stoppedEarly = true;
      results.push({ email, isValid: false, smtp: { passed: false, message: "Skipped (early exit)" } });
    }
  }

  return {
    domain,
    isCatchAll: smtpBatch.isCatchAll,
    domainInfo,
    results,
    validEmail: smtpBatch.validEmail,
    stoppedEarly,
    timestamp,
  };
}
