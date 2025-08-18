"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FpsSelectorProps = {
  value: number;
  onValueChange: (fps: number) => void;
  options?: number[];
  disabled?: boolean;
  className?: string;
};

export function FpsSelector({
  value,
  onValueChange,
  options = [4, 12, 24, 30, 60],
  disabled,
  className,
}: FpsSelectorProps) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onValueChange(Number(v))}
    >
      <SelectTrigger className={className} disabled={disabled}>
        <SelectValue placeholder="FPS" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={String(opt)}>
            {opt} FPS
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type DurationSelectorProps = {
  value: number;
  onValueChange: (duration: number) => void;
  options?: number[];
  disabled?: boolean;
  className?: string;
};

export function DurationSelector({
  value,
  onValueChange,
  options = [5, 10, 15],
  disabled,
  className,
}: DurationSelectorProps) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onValueChange(Number(v))}
    >
      <SelectTrigger className={className} disabled={disabled}>
        <SelectValue placeholder="Duration" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={String(opt)}>
            {opt}s
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
