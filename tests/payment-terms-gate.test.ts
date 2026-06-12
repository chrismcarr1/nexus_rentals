import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Server actions that move money (lib/actions.ts) reject any request from a
// user who has not accepted the current PAYMENT_TERMS_VERSION unless the form
// posts acceptPaymentTerms=on. This suite is a regression tripwire for the
// outage where the dashboard "Pay rent" and per-row "Pay" buttons posted
// checkout without the acknowledgement and every tenant bounced with
// stripe=payment-terms-required: any page that renders one of these forms must
// also consult hasAcceptedCurrentPaymentTerms so it can either render the
// acknowledgement checkbox or route the user to a form that has it.

const GATED_FORM_ACTIONS = [
  "createStripeCheckoutAction",
  "createBundledStripeCheckoutAction",
  "connectStripeAccountAction",
  "reconnectStripeAccountAction"
];

const APP_DIR = path.join(__dirname, "..", "app");

async function collectTsxFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsxFiles(full)));
    } else if (entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

describe("payment terms gate UI coverage", () => {
  it("every page posting a Stripe money-movement action handles the payment-terms gate", async () => {
    const files = await collectTsxFiles(APP_DIR);
    const offenders: string[] = [];

    for (const file of files) {
      const source = await fs.readFile(file, "utf8");
      const postsGatedAction = GATED_FORM_ACTIONS.some((action) => source.includes(`action={${action}}`));
      if (!postsGatedAction) continue;
      if (!source.includes("hasAcceptedCurrentPaymentTerms")) {
        offenders.push(path.relative(path.join(__dirname, ".."), file));
      }
    }

    expect(
      offenders,
      `These pages post a payment-terms-gated Stripe action but never check hasAcceptedCurrentPaymentTerms, ` +
        `so users who have not accepted the current payment terms get bounced with stripe=payment-terms-required: ` +
        offenders.join(", ")
    ).toEqual([]);
  });

  it("the shared acknowledgement posts the exact field the server checks", async () => {
    const componentSource = await fs.readFile(
      path.join(__dirname, "..", "components", "payment-terms-acknowledgement.tsx"),
      "utf8"
    );
    const actionsSource = await fs.readFile(path.join(__dirname, "..", "lib", "actions.ts"), "utf8");

    // The checkbox posts "on" (browser default for a value-less checkbox);
    // ensurePaymentTermsAccepted requires exactly acceptPaymentTerms === "on".
    expect(componentSource).toContain('name="acceptPaymentTerms"');
    expect(actionsSource).toContain('formData?.get("acceptPaymentTerms") !== "on"');
  });
});
