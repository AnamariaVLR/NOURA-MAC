/**
 * RUBRIC.md §6 — Certification.
 *
 * The rules here are all POLICY, and the reason matters more than usual: a
 * certificate is the one piece of evidence a user is most likely to read as a
 * health claim, and §6.2 exists to stop that.
 */

import { describe, expect, it } from "vitest";
import { evaluateChecks } from "../../lib/health/checks";
import type { CertificationEvidence } from "../../lib/health/checks";
import { checkFor, input, SOURCE, statusOf } from "./helpers";

function certificate(over: Partial<CertificationEvidence> = {}): CertificationEvidence {
  return {
    certificateType: "ECAS",
    status: "valid",
    bodyName: null,
    certificateNumber: "ECAS-123",
    sourceKind: "REGULATOR_IMPORT",
    source: SOURCE,
    ...over,
  };
}

const certCheck = (certifications: CertificationEvidence[]) =>
  checkFor(evaluateChecks(input({ certifications })), "certification");

describe("C6.1 — provenance: demo scaffolding is not evidence", () => {
  it("a SYNTHETIC certificate produces unknown, not a pass", () => {
    const check = certCheck([certificate({ sourceKind: "SYNTHETIC" })]);
    expect(check?.status).toBe("unknown");
  });

  it("a SYNTHETIC certificate cannot produce a failure either", () => {
    // Demo scaffolding is not a finding against a product.
    const check = certCheck([certificate({ sourceKind: "SYNTHETIC", status: "suspended" })]);
    expect(check?.status).toBe("unknown");
    expect(check?.disqualifying).toBeUndefined();
  });

  it("an unrecognised source kind fails closed — it hides the row, never promotes it", () => {
    expect(certCheck([certificate({ sourceKind: "REGULATOR_IMPRT" })])?.status).toBe("unknown");
  });

  it("says that demo rows exist without showing them as evidence", () => {
    expect(certCheck([certificate({ sourceKind: "SYNTHETIC" })])?.detail).toContain("demo data");
  });
});

describe("C6.4 — status", () => {
  it("valid passes", () => {
    expect(certCheck([certificate()])?.status).toBe("pass");
  });

  it("expired fails, and does not disqualify: the assurance is out of date, not adverse", () => {
    const check = certCheck([certificate({ status: "expired" })]);
    expect(check?.status).toBe("fail");
    expect(check?.disqualifying).toBeUndefined();
  });

  it("suspended fails AND disqualifies — V2.1", () => {
    const check = certCheck([certificate({ status: "suspended" })]);
    expect(check?.status).toBe("fail");
    expect(check?.disqualifying).toBe(true);
  });

  it("a suspension outranks a valid certificate held alongside it", () => {
    const check = certCheck([certificate(), certificate({ status: "suspended" })]);
    expect(check?.disqualifying).toBe(true);
  });
});

describe("C6.5 — what a certificate does not say, in the copy itself", () => {
  it("every passing certification check carries the nutrition disclaimer", () => {
    for (const bodyName of [null, "SAMPLE — Emirates Conformity Body"]) {
      const check = certCheck([certificate({ bodyName })]);
      expect(check?.status).toBe("pass");
      expect(check?.detail).toContain("not a statement that the product is nutritionally better");
    }
  });

  it("names the accrediting body when the record has one", () => {
    const check = certCheck([certificate({ bodyName: "A Named Body" })]);
    expect(check?.evidence.value).toContain("accredited body");
  });
});

describe("C6.10 / D9 — absence is unknown", () => {
  it("no certificate on file is unknown, and says why", () => {
    const check = certCheck([]);
    expect(check?.status).toBe("unknown");
    expect(check?.detail).toContain("does not mean it is uncertified");
  });

  it("certification alone never carries a verdict", () => {
    // C6.9 — one check among several. With only a certificate passing, coverage
    // and the three-check minimum both bite.
    const checks = evaluateChecks(
      input({ nutrition: null, ingredientsText: null, certifications: [certificate()] }),
    );
    expect(statusOf(checks, "certification")).toBe("pass");
    expect(checks.filter((c) => c.status === "pass")).toHaveLength(1);
  });
});
