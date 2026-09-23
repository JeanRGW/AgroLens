const REDACTED = '[REDACTED]';
const MAX_DIAGNOSTIC_LENGTH = 200;

/** Keeps operational diagnostics useful while removing credentials and storage identifiers. */
export function sanitizeError(value: unknown): string | null {
  if (value == null) return null;
  const input =
    value instanceof Error ? value.message : typeof value === 'string' ? value : String(value);
  let result = input;

  // URLs (including presigned S3 URLs) must lose both their path and query string.
  result = result.replace(/https?:\/\/[^\s"']+/gi, REDACTED);
  // Bare repository storage keys are sensitive even when no URL or label is present.
  result = result.replace(/\b(?:uploads|models)\/[A-Za-z0-9._~!$&'()*+,;=@%/-]+/gi, REDACTED);
  // Email addresses are PII and are not useful in operational diagnostics.
  result = result.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED);
  // JWTs and bearer credentials can occur without a key/value label.
  result = result.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`);
  result = result.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED);
  // Named secrets, including values containing spaces (until a common delimiter).
  result = result.replace(
    /\b(?:token|secret|password|authorization|object[_ -]?key|signature|presigned(?:[_ -]?url)?)\b\s*(?:[:=]|is)\s*(?:"[^"]*"|'[^']*'|[^,;\n}]+)/gi,
    REDACTED,
  );
  // Common AWS query credentials/signatures when a URL was embedded in punctuation.
  result = result.replace(
    /(?:X-Amz-(?:Credential|Signature|Security-Token)|AWSAccessKeyId|Signature|Policy)\s*=\s*[^&\s,;]+/gi,
    REDACTED,
  );
  // Avoid leaking raw query strings even when the URL itself was truncated or escaped.
  result = result.replace(
    /[?&](?:token|secret|password|signature|credential|authorization)=[^\s&]+/gi,
    `?${REDACTED}`,
  );

  result = result.replace(/\s+/g, ' ').trim();
  result = result.slice(0, MAX_DIAGNOSTIC_LENGTH);
  return result || null;
}
