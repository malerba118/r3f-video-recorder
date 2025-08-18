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
  size?: "sm" | "default";
  className?: string;
};

export function FpsSelector({
  value,
  onValueChange,
  options = [4, 12, 24, 30, 60],
  size = "default",
  className,
}: FpsSelectorProps) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onValueChange(Number(v))}
    >
      <SelectTrigger size={size} className={className}>
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
