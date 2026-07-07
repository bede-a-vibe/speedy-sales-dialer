import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type MultiSelectOption = string | { value: string; label: string };

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  maxDisplayed?: number;
}

function optValue(o: MultiSelectOption): string {
  return typeof o === "string" ? o : o.value;
}
function optLabel(o: MultiSelectOption): string {
  return typeof o === "string" ? o : o.label;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select...",
  emptyMessage = "No results found.",
  disabled = false,
  className,
  maxDisplayed = 2,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const labelByValue = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(optValue(o), optLabel(o));
    return m;
  }, [options]);

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const displayText = React.useMemo(() => {
    if (selected.length === 0) return null;
    const labels = selected.map((v) => labelByValue.get(v) ?? v);
    if (labels.length <= maxDisplayed) return labels.join(", ");
    return `${labels.slice(0, maxDisplayed).join(", ")} +${labels.length - maxDisplayed}`;
  }, [selected, maxDisplayed, labelByValue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between border-border bg-card text-xs font-normal",
            !displayText && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {displayText || placeholder}
          </span>
          <div className="ml-1 flex shrink-0 items-center gap-1">
            {selected.length > 0 && (
              <Badge
                variant="secondary"
                className="h-4 rounded-sm px-1 text-[10px] font-normal"
                onClick={handleClear}
              >
                {selected.length}
                <X className="ml-0.5 h-2.5 w-2.5" />
              </Badge>
            )}
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search...`} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
              {emptyMessage}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const value = optValue(option);
                const label = optLabel(option);
                const isSelected = selected.includes(value);
                return (
                  <CommandItem
                    key={value}
                    value={label}
                    onSelect={() => handleToggle(value)}
                    className="text-xs"
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    {label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {selected.length > 0 && (
          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => onChange([])}
            >
              Clear all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
