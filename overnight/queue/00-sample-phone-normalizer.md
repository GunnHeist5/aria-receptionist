# Sample task — US phone number normalizer

> This is a throwaway dry-run task to watch the queue loop end-to-end.
> Delete it (or let it move to done/) whenever.

## What I want built

A small, pure, dependency-free helper that normalizes messy US phone input into
E.164 format.

Create `lib/phone.js` (CommonJS — `module.exports`) exporting one function:

`normalizeUSPhone(input)` →
- returns a string `"+1XXXXXXXXXX"` for a valid US number, or
- returns `null` for anything invalid.

Rules:
- Strip all non-digit characters before evaluating.
- Accept 10 digits (area code + number) → prefix `+1`.
- Accept 11 digits that start with `1` → prefix `+` (it already has the country code).
- Anything else (too few digits, too many digits, empty, null, non-string) → `null`.

## Where it lives

- New file: `lib/phone.js`
- New tests: `tests/phone.test.js` (Node's built-in `node --test`, run via `npm test`)

## How I'll know it works (acceptance criteria)

- [ ] `normalizeUSPhone("(215) 760-9749")` → `"+12157609749"`
- [ ] `normalizeUSPhone("215-760-9749")` → `"+12157609749"`
- [ ] `normalizeUSPhone("2157609749")` → `"+12157609749"`
- [ ] `normalizeUSPhone("12157609749")` → `"+12157609749"`
- [ ] `normalizeUSPhone("+1 215 760 9749")` → `"+12157609749"`
- [ ] `normalizeUSPhone("760-9749")` → `null`  (only 7 digits)
- [ ] `normalizeUSPhone("12345678901234")` → `null`  (too long)
- [ ] `normalizeUSPhone("")`, `normalizeUSPhone(null)`, `normalizeUSPhone("abc")`, `normalizeUSPhone(2157609749)` → `null`
- [ ] `npm test` passes (existing tests stay green too)

## Out of scope / don't touch

- Do NOT modify any existing files or wire this into the app. New files only.

## Notes

- Keep it dependency-free. No npm installs needed.
