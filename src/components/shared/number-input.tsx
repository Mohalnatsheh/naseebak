"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { toLatinDigits } from "@/lib/digits";

/**
 * A whole-number field (height, weight, ages, counts). `type="number"` silently drops the Arabic-Indic
 * digits (١٧٨) an Arabic keyboard types, so this is a text field that keeps digits only, as Western
 * digits, and still opens the number keypad on phones.
 */
export function NumberInput({ onChange, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      onChange={(e) => {
        e.target.value = toLatinDigits(e.target.value).replace(/\D/g, "");
        onChange?.(e);
      }}
    />
  );
}
