# Project Agent Instructions

## Mandatory Ponytail workflow

For every task that involves planning, designing, implementing, fixing,
refactoring, or reviewing code in this repository:

1. Use the globally installed `ponytail` skill before planning or design begins,
   and keep it active in `full` mode through implementation.
2. Read and trace the affected code path end to end before choosing a solution.
   Apply Ponytail's ladder: avoid speculative work, reuse existing code, prefer
   standard-library and native platform features, reuse installed dependencies,
   and only then add the minimum code that works.
3. Do not simplify away explicit requirements, trust-boundary validation,
   data-loss prevention, error handling, security, accessibility, or the smallest
   runnable check required for non-trivial logic.
4. Before claiming an implementation is complete, use `ponytail-review` on the
   final diff, apply safe in-scope simplifications, and run the relevant checks.

If either required skill is unavailable, report that before making code changes.
