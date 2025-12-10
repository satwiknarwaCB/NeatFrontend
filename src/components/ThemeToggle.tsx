import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

export function ThemeToggle() {
  return (
    <Button variant="ghost" size="icon" className="relative w-9 h-9 p-0">
      <AnimatedThemeToggler className="w-5 h-5" />
    </Button>
  );
}