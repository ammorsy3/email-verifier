export interface MxRecord {
  exchange: string;
  priority: number;
}

export interface CheckResult {
  passed: boolean;
  message: string;
  records?: MxRecord[];
}

export interface VerificationChecks {
  format: CheckResult;
  mx: CheckResult;
  smtp: CheckResult;
  disposable: CheckResult;
  roleBased: CheckResult;
  freeProvider: CheckResult;
}

export interface VerificationResult {
  email: string;
  isValid: boolean;
  checks: VerificationChecks;
  isCatchAll: boolean;
  suggestedDomain: string | null;
  timestamp: string;
}

export interface VerificationRequest {
  email: string;
}

export interface SmtpBatchResult {
  results: Map<string, { valid: boolean | null; message: string }>;
  isCatchAll: boolean;
  validEmail: string | null;
}

export interface BatchVerificationRequest {
  emails: string[];
}

export interface BatchEmailResult {
  email: string;
  isValid: boolean;
  smtp: { passed: boolean; message: string };
}

export interface BatchVerificationResult {
  domain: string;
  isCatchAll: boolean;
  domainInfo: {
    isDisposable: boolean;
    isFreeProvider: boolean;
    hasMxRecords: boolean;
    mxRecords: MxRecord[];
  };
  results: BatchEmailResult[];
  validEmail: string | null;
  stoppedEarly: boolean;
  timestamp: string;
}
