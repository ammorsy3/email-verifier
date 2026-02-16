import net from "net";
import crypto from "crypto";
import { SmtpBatchResult } from "../types";

export interface SmtpResult {
  valid: boolean | null; // null = inconclusive
  isCatchAll: boolean;
  message: string;
}

function sendCommand(
  socket: net.Socket,
  command: string
): Promise<{ code: number; text: string }> {
  return new Promise((resolve, reject) => {
    const onData = (data: Buffer) => {
      const response = data.toString();
      const code = parseInt(response.substring(0, 3), 10);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      resolve({ code, text: response.trim() });
    };
    const onError = (err: Error) => {
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      reject(err);
    };
    socket.on("data", onData);
    socket.on("error", onError);
    socket.write(command + "\r\n");
  });
}

function waitForGreeting(socket: net.Socket): Promise<{ code: number; text: string }> {
  return new Promise((resolve, reject) => {
    const onData = (data: Buffer) => {
      const response = data.toString();
      const code = parseInt(response.substring(0, 3), 10);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      resolve({ code, text: response.trim() });
    };
    const onError = (err: Error) => {
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      reject(err);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

export async function verifySmtp(
  email: string,
  mxHost: string
): Promise<SmtpResult> {
  const domain = email.split("@")[1];
  const randomLocal = crypto.randomBytes(16).toString("hex");
  const randomEmail = `${randomLocal}@${domain}`;

  const CONNECTION_TIMEOUT = 7000;
  const TOTAL_TIMEOUT = 10000;

  return new Promise<SmtpResult>((resolve) => {
    let settled = false;
    const finish = (result: SmtpResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      try {
        socket.write("QUIT\r\n");
        socket.end();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const totalTimer = setTimeout(() => {
      finish({ valid: null, isCatchAll: false, message: "SMTP verification timed out" });
    }, TOTAL_TIMEOUT);

    const socket = net.createConnection({ host: mxHost, port: 25, timeout: CONNECTION_TIMEOUT });

    socket.on("timeout", () => {
      finish({ valid: null, isCatchAll: false, message: "Connection timed out" });
    });

    socket.on("error", (err: Error) => {
      finish({ valid: null, isCatchAll: false, message: `SMTP connection error: ${err.message}` });
    });

    socket.once("connect", async () => {
      try {
        // Wait for server greeting
        const greeting = await waitForGreeting(socket);
        if (greeting.code !== 220) {
          finish({ valid: null, isCatchAll: false, message: `Unexpected greeting: ${greeting.text}` });
          return;
        }

        // EHLO
        const ehlo = await sendCommand(socket, `EHLO verifier.local`);
        if (ehlo.code !== 250) {
          finish({ valid: null, isCatchAll: false, message: `EHLO rejected: ${ehlo.text}` });
          return;
        }

        // MAIL FROM
        const mailFrom = await sendCommand(socket, `MAIL FROM:<>`);
        if (mailFrom.code !== 250) {
          finish({ valid: null, isCatchAll: false, message: `MAIL FROM rejected: ${mailFrom.text}` });
          return;
        }

        // Catch-all detection: test with random address first
        const catchAllCheck = await sendCommand(socket, `RCPT TO:<${randomEmail}>`);
        const isCatchAll = catchAllCheck.code === 250;

        if (isCatchAll) {
          // Server accepts anything — can't reliably verify individual addresses
          finish({ valid: null, isCatchAll: true, message: "Catch-all domain detected" });
          return;
        }

        // Reset and test actual email
        await sendCommand(socket, "RSET");
        await sendCommand(socket, `MAIL FROM:<>`);

        const rcpt = await sendCommand(socket, `RCPT TO:<${email}>`);

        if (rcpt.code === 250) {
          finish({ valid: true, isCatchAll: false, message: "Mailbox exists" });
        } else if (rcpt.code >= 500 && rcpt.code < 600) {
          finish({ valid: false, isCatchAll: false, message: `Mailbox does not exist (${rcpt.code}: ${rcpt.text})` });
        } else if (rcpt.code >= 400 && rcpt.code < 500) {
          // Greylisting or temporary error
          finish({ valid: null, isCatchAll: false, message: `Temporarily unavailable (${rcpt.code}: ${rcpt.text})` });
        } else {
          finish({ valid: null, isCatchAll: false, message: `Unexpected response: ${rcpt.text}` });
        }
      } catch (err: any) {
        finish({ valid: null, isCatchAll: false, message: `SMTP error: ${err.message}` });
      }
    });
  });
}

export async function verifySmtpBatch(
  emails: string[],
  mxHost: string
): Promise<SmtpBatchResult> {
  const domain = emails[0].split("@")[1];
  const randomLocal = crypto.randomBytes(16).toString("hex");
  const randomEmail = `${randomLocal}@${domain}`;

  const CONNECTION_TIMEOUT = 7000;
  const TOTAL_TIMEOUT = 30000;

  return new Promise<SmtpBatchResult>((resolve) => {
    let settled = false;
    const results = new Map<string, { valid: boolean | null; message: string }>();

    const finish = (result: SmtpBatchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      try {
        socket.write("QUIT\r\n");
        socket.end();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const inconclusive = (message: string): SmtpBatchResult => {
      for (const email of emails) {
        if (!results.has(email)) {
          results.set(email, { valid: null, message });
        }
      }
      return { results, isCatchAll: false, validEmail: null };
    };

    const totalTimer = setTimeout(() => {
      finish(inconclusive("SMTP batch verification timed out"));
    }, TOTAL_TIMEOUT);

    const socket = net.createConnection({ host: mxHost, port: 25, timeout: CONNECTION_TIMEOUT });

    socket.on("timeout", () => {
      finish(inconclusive("Connection timed out"));
    });

    socket.on("error", (err: Error) => {
      finish(inconclusive(`SMTP connection error: ${err.message}`));
    });

    socket.once("connect", async () => {
      try {
        const greeting = await waitForGreeting(socket);
        if (greeting.code !== 220) {
          finish(inconclusive(`Unexpected greeting: ${greeting.text}`));
          return;
        }

        const ehlo = await sendCommand(socket, `EHLO verifier.local`);
        if (ehlo.code !== 250) {
          finish(inconclusive(`EHLO rejected: ${ehlo.text}`));
          return;
        }

        const mailFrom = await sendCommand(socket, `MAIL FROM:<>`);
        if (mailFrom.code !== 250) {
          finish(inconclusive(`MAIL FROM rejected: ${mailFrom.text}`));
          return;
        }

        // Catch-all detection
        const catchAllCheck = await sendCommand(socket, `RCPT TO:<${randomEmail}>`);
        if (catchAllCheck.code === 250) {
          for (const email of emails) {
            results.set(email, { valid: null, message: "Catch-all domain detected" });
          }
          finish({ results, isCatchAll: true, validEmail: null });
          return;
        }

        // Test each email
        let validEmail: string | null = null;
        for (const email of emails) {
          if (settled) break;

          await sendCommand(socket, "RSET");
          await sendCommand(socket, `MAIL FROM:<>`);
          const rcpt = await sendCommand(socket, `RCPT TO:<${email}>`);

          if (rcpt.code === 250) {
            results.set(email, { valid: true, message: "Mailbox exists" });
            validEmail = email;
            break; // Early exit on first valid
          } else if (rcpt.code >= 500 && rcpt.code < 600) {
            results.set(email, { valid: false, message: `Mailbox does not exist (${rcpt.code}: ${rcpt.text})` });
          } else if (rcpt.code >= 400 && rcpt.code < 500) {
            results.set(email, { valid: null, message: `Temporarily unavailable (${rcpt.code}: ${rcpt.text})` });
          } else {
            results.set(email, { valid: null, message: `Unexpected response: ${rcpt.text}` });
          }
        }

        finish({ results, isCatchAll: false, validEmail });
      } catch (err: any) {
        finish(inconclusive(`SMTP error: ${err.message}`));
      }
    });
  });
}
