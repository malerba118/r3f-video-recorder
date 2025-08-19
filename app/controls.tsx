"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SizePreset } from "@/r3f-video-recorder";

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

type SizeSelectorProps = {
  value: SizePreset;
  onValueChange: (size: SizePreset) => void;
  options?: SizePreset[];
  disabled?: boolean;
  className?: string;
};

export function SizeSelector({
  value,
  onValueChange,
  options = ["1x", "2x", "3x", "4x"],
  disabled,
  className,
}: SizeSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as SizePreset)}>
      <SelectTrigger className={className} disabled={disabled}>
        <SelectValue placeholder="Duration" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={String(opt)}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
