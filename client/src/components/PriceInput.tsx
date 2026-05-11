import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

interface PriceInputProps {
  value: number; // Price in cents
  onChange: (cents: number) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  'data-testid'?: string;
}

export function PriceInput({ 
  value, 
  onChange, 
  onBlur,
  placeholder = "50.00",
  className = "",
  'data-testid': dataTestId
}: PriceInputProps) {
  const [displayValue, setDisplayValue] = useState<string>(
    value !== undefined && value !== null ? (value / 100).toFixed(2) : ''
  );
  const isFocusedRef = useRef(false);

  // Sync external value changes ONLY when not focused
  // Use ref for isFocused to avoid effect deps on displayValue
  useEffect(() => {
    if (!isFocusedRef.current && value !== undefined && value !== null) {
      setDisplayValue((value / 100).toFixed(2));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setDisplayValue(inputValue);
    
    // Allow empty or partial input during editing
    if (inputValue === '' || inputValue === '.') {
      return;
    }
    
    // Convert to cents and notify parent
    const dollars = parseFloat(inputValue);
    if (!isNaN(dollars) && dollars >= 0) {
      onChange(Math.round(dollars * 100));
    }
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    
    const inputValue = e.target.value;
    
    // Format and update on blur
    const dollars = parseFloat(inputValue);
    if (!isNaN(dollars) && dollars >= 0) {
      const formatted = dollars.toFixed(2);
      setDisplayValue(formatted);
      onChange(Math.round(dollars * 100));
    } else {
      setDisplayValue('0.00');
      onChange(0);
    }
    onBlur?.();
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
      <Input 
        type="number"
        step="0.01"
        min="0"
        placeholder={placeholder}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`pl-7 ${className}`}
        data-testid={dataTestId}
      />
    </div>
  );
}
