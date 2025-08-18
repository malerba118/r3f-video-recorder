import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatTime = (seconds: number): string => {
  if (Number.isNaN(seconds) || seconds < 0) {
    return "00:00.00"; // Or handle error appropriately
  }

  let totalSeconds = Math.floor(seconds);
  let milliseconds = Math.round((seconds - totalSeconds) * 100); // Get first two decimal places

  if (milliseconds === 100) {
    milliseconds = 0;
    totalSeconds += 1;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const msStr = milliseconds.toString().padStart(2, "0");
  const secsStr = secs.toString().padStart(2, "0");
  const minsStr = minutes.toString().padStart(2, "0");

  if (hours > 0) {
    const hoursStr = hours.toString().padStart(2, "0");
    return `${hoursStr}:${minsStr}:${secsStr}.${msStr}`;
  } else if (minutes > 0) {
    return `${minsStr}:${secsStr}.${msStr}`;
  } else {
    return `${secsStr}.${msStr}`;
  }
};
