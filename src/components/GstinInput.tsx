import { useEffect, useState } from "react";
import { gstApi } from "@/api/endpoints";
import { checkGstin } from "@/lib/gst";
import { Field, Input } from "./ui";

interface Props {
  label?: string;
  value: string;
  onChange: (value: string, stateCode: string | null) => void;
  required?: boolean;
  /** When set, a valid GSTIN whose state does not match shows a warning. */
  expectedStateCode?: string | null;
}

/**
 * GSTIN field with instant local check-digit validation and a debounced
 * confirmation from the backend's /gst/validate-gstin endpoint.
 */
export function GstinInput({ label = "GSTIN", value, onChange, required, expectedStateCode }: Props) {
  const local = checkGstin(value);
  const [serverName, setServerName] = useState<string | null>(null);

  useEffect(() => {
    setServerName(null);
    if (!local.valid) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      gstApi
        .validateGstin(local.normalised)
        .then((res) => {
          if (!controller.signal.aborted) setServerName(res.valid ? res.state_name : null);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [local.valid, local.normalised]);

  const mismatch = local.valid && expectedStateCode && local.stateCode !== expectedStateCode;
  const hint = local.valid
    ? `Valid · state ${local.stateCode}${serverName ? ` (${serverName})` : ""}`
    : "15 characters, e.g. 27AAPFU0939F1ZV";

  return (
    <Field
      label={label}
      required={required}
      error={value && local.error ? local.error : mismatch ? `State ${local.stateCode} differs from the selected state ${expectedStateCode}.` : null}
      hint={hint}
    >
      <Input
        value={value}
        maxLength={15}
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="27AAPFU0939F1ZV"
        onChange={(e) => {
          const next = e.target.value.toUpperCase();
          onChange(next, checkGstin(next).stateCode);
        }}
      />
    </Field>
  );
}
