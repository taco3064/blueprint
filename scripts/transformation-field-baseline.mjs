function findingKey(finding, includeSeverity) {
  return [
    ...(includeSeverity ? [finding.severity] : []),
    finding.rule,
    finding.path,
    finding.subject,
  ].join('\0');
}

function identities(findings, includeSeverity) {
  return findings.map((finding) => ({
    ...(includeSeverity ? { severity: finding.severity } : {}),
    rule: finding.rule,
    path: finding.path,
    subject: finding.subject,
  })).sort((a, b) => findingKey(a, includeSeverity).localeCompare(
    findingKey(b, includeSeverity),
  ));
}

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function reviewInspection(record, expectedFindings) {
  let parsed;

  try {
    parsed = JSON.parse(record.output);
  } catch {
    return {
      approved: false,
      reason: 'inspect --json did not return valid JSON',
      expectedFindings: identities(expectedFindings, true),
      actualFindings: [],
    };
  }

  const expected = identities(expectedFindings, true);
  const actual = identities(parsed.findings ?? [], true);
  const expectedCode = parsed.ok === true ? 0 : 1;

  return {
    approved: record.code === expectedCode && same(actual, expected),
    reason: same(actual, expected)
      ? `inspect exit ${record.code}; report ok=${String(parsed.ok)}`
      : 'actual findings did not exactly match the reviewed fixture ledger',
    expectedFindings: expected,
    actualFindings: actual,
  };
}

export function reviewBaseline(text, expectedFindings) {
  let entries = [];

  if (text !== null) {
    try {
      const parsed = JSON.parse(text);

      entries = Array.isArray(parsed.findings) ? parsed.findings : [];
    } catch {
      return {
        matches: false,
        present: true,
        expectedFindings: identities(expectedFindings, false),
        actualFindings: [],
      };
    }
  }

  const expected = identities(expectedFindings, false);
  const actual = identities(entries, false);

  return {
    matches: same(actual, expected) && (text !== null) === (expected.length > 0),
    present: text !== null,
    expectedFindings: expected,
    actualFindings: actual,
  };
}
