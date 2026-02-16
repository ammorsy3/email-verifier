import { Router, Request, Response } from "express";
import { verifyEmail, verifyEmailBatch } from "../services/emailVerifier";

const router = Router();

router.post("/verify", async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const result = await verifyEmail(email.trim().toLowerCase());
  res.json(result);
});

router.post("/verify/batch", async (req: Request, res: Response) => {
  const { emails } = req.body;

  if (!Array.isArray(emails) || emails.length === 0) {
    res.status(400).json({ error: "emails must be a non-empty array of strings" });
    return;
  }

  if (emails.length > 10) {
    res.status(400).json({ error: "Maximum 10 emails per batch" });
    return;
  }

  if (!emails.every((e: unknown) => typeof e === "string" && e.includes("@"))) {
    res.status(400).json({ error: "All entries must be valid email strings" });
    return;
  }

  const normalized = emails.map((e: string) => e.trim().toLowerCase());
  const domains = new Set(normalized.map((e: string) => e.split("@")[1]));

  if (domains.size !== 1) {
    res.status(400).json({ error: "All emails must share the same domain" });
    return;
  }

  const result = await verifyEmailBatch(normalized);
  res.json(result);
});

export default router;
