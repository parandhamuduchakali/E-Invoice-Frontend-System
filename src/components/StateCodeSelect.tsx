import { useQuery } from "@tanstack/react-query";
import type { SelectHTMLAttributes } from "react";
import { gstApi } from "@/api/endpoints";

/** Dropdown of GST state codes fetched once from the backend. */
export function StateCodeSelect({ value, allowEmpty = true, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { allowEmpty?: boolean }) {
  const { data: states = [] } = useQuery({
    queryKey: ["gst", "state-codes"],
    queryFn: gstApi.stateCodes,
    staleTime: Infinity,
  });
  return (
    <select className="input" value={value ?? ""} {...props}>
      {allowEmpty && <option value="">— select state —</option>}
      {states.map((s) => (
        <option key={s.code} value={s.code}>
          {s.code} — {s.name}
        </option>
      ))}
    </select>
  );
}

export function useStateName(code: string | null | undefined): string {
  const { data: states = [] } = useQuery({
    queryKey: ["gst", "state-codes"],
    queryFn: gstApi.stateCodes,
    staleTime: Infinity,
  });
  if (!code) return "";
  return states.find((s) => s.code === code)?.name ?? code;
}
