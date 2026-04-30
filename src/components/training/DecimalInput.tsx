import React, { useEffect, useRef, useState } from 'react';
import {
  TextInput,
  type StyleProp,
  type TextStyle,
  type ReturnKeyTypeOptions,
} from 'react-native';
import {
  parseDecimalInput,
  shouldResyncDraft,
} from './decimalInputHelpers';

// TextInput wrapper that preserves mid-keystroke decimal state.
//
// Bug it fixes: a controlled TextInput whose `value` is `String(num)`
// cannot show "72." — parseFloat collapses it to 72, the parent
// re-renders with String(72)="72", and the dot disappears before
// the user can type the fractional digit. Same issue for ".5", any
// leading/trailing partial.
//
// Fix: hold the typed text in local string state. Commit the parsed
// number to the parent on every keystroke, but only resync the draft
// from the parent's value prop when the change came from outside
// (copy-previous-set, reset). A useRef tracks the last value we
// committed; if the incoming value prop matches it, we ignore the
// echo of our own commit.
//
// MANUAL-VERIFY checklist (deferred until 5/1 build, no RNTL yet):
//   - Tap field with selectTextOnFocus → first digit replaces value
//   - Type "72." → "." stays visible
//   - Type "72.5" → field shows "72.5", commits 72.5
//   - External state change (copy-previous-set) → draft updates
//   - returnKeyType="next" / "done" → focus advances correctly

interface DecimalInputProps {
  value: number | null;
  onCommit: (value: number | null) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  placeholderTextColor?: string;
  editable?: boolean;
  selectTextOnFocus?: boolean;
  returnKeyType?: ReturnKeyTypeOptions;
}

export function DecimalInput({
  value,
  onCommit,
  style,
  placeholder,
  placeholderTextColor,
  editable,
  selectTextOnFocus,
  returnKeyType,
}: DecimalInputProps): React.ReactElement {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : '');
  const lastCommittedRef = useRef<number | null>(value);

  useEffect(() => {
    if (shouldResyncDraft(value, lastCommittedRef.current)) {
      setDraft(value != null ? String(value) : '');
      lastCommittedRef.current = value;
    }
  }, [value]);

  const handleChangeText = (text: string) => {
    const result = parseDecimalInput(text);
    setDraft(text);
    if (result.kind === 'empty') {
      lastCommittedRef.current = null;
      onCommit(null);
    } else if (result.kind === 'parsed') {
      lastCommittedRef.current = result.value;
      onCommit(result.value);
    }
    // 'invalid' → keep draft for visibility, do not commit. With
    // keyboardType="decimal-pad" iOS blocks letters; this is the
    // Android / programmatic-input safety net.
  };

  return (
    <TextInput
      style={style}
      value={draft}
      onChangeText={handleChangeText}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      editable={editable}
      selectTextOnFocus={selectTextOnFocus}
      returnKeyType={returnKeyType}
    />
  );
}
