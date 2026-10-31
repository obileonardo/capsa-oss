'use client';
/* THM-07 (Track C): a changeable shortcut's binding as in use now, its label (⌘K, C) and its aria-keyshortcuts value. */
import { ariaKeys, bindingOf, displayKey, type ActionId } from './shortcuts';
import { useAppState } from './store';

export function useBinding(id: ActionId) {
  const { state } = useAppState();
  const binding = bindingOf(id, state.prefs.keys);
  return { binding, label: displayKey(binding), aria: ariaKeys(binding) };
}
