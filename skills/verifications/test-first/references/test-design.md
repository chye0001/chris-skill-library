# Test design

Three black-box techniques for deriving test cases from the specification. Write only the tables whose technique fits the input:

- A string with no ordered range has no boundaries.
- A rule with a single condition needs no decision table.
- A function with no lifecycle needs no state-transition table.

## Table A: Equivalence partitions and 3-value boundaries

Write one row per partition, including invalid partitions. Every row gets an EP value. Each boundary gets three BV values: boundary − 1 step, the boundary, and boundary + 1 step, where a step is the smallest meaningful unit (1 cent, 1 second, 1 item, 1 character). Write each boundary once, on one of the two rows it separates, and use `—` on rows with none.

```
| Rule     | Type    | Partition     | EP value | BV values   |
| -------- | ------- | ------------- | -------- | ----------- |
| Quantity | Invalid | quantity < 1  | -5       | 0, 1, 2     |
| Quantity | Valid   | 1 … 99        | 12       | 98, 99, 100 |
| Quantity | Invalid | quantity > 99 | 500      | —           |
```

Boundaries worth looking for:

- numeric limits in validation schemas,
- zero when it has a special meaning, such as disabling a feature. That makes it a partition edge, not just a number,
- money in its smallest unit,
- time windows, cooldowns, and expiry,
- minimum and maximum selection counts,
- empty versus one versus many items in a collection,
- string length limits.

## Table B: Decision table

Use it for rules that combine conditions. Put conditions in rows, one column per rule, `–` for "doesn't matter", and actions below the conditions. Collapse rules that share an outcome.

```
| Conditions / actions   | R1 | R2 | R3 | R4 |
| ---------------------- | -- | -- | -- | -- |
| Discount code exists   | N  | Y  | Y  | Y  |
| Code expired           | –  | Y  | N  | N  |
| Order meets minimum    | –  | –  | N  | Y  |
| → discount applied     | N  | N  | N  | Y  |
```

## Table C: State transitions

Use it for anything with a lifecycle, such as an order status or a session. List every legal transition from the spec, then the illegal ones that matter: backwards moves, skipped states, acting on a terminal state, and a late timer or webhook acting after a cancellation.

```
| From      | Event / action          | To        | Legal               |
| --------- | ----------------------- | --------- | ------------------- |
| PLACED    | payment succeeds        | PAID      | Y                   |
| PAID      | warehouse ships         | SHIPPED   | Y                   |
| SHIPPED   | move back to PAID       | —         | N (backwards)       |
| PLACED    | warehouse ships         | —         | N (skips PAID)      |
| CANCELLED | late payment webhook    | —         | N (no resurrection) |
```

Write the legal rows from the spec, not from the code's transition map. Rows generated from the code under test pass whatever the code says. Add one assertion that the set of legal pairs in the code's transition map equals the table's, so an unplanned transition fails.

## From table to test

Write one parametrised test per table, with one case per EP value and per BV value. Name each case after its row and technique, so the cases read as the table and a failure points at the row:

- Partitions and boundaries: `quantity < 1 (EP)`, `boundary 1 − 1 (BV)`, `boundary 1 (BV)`
- Decision tables: `R3: code valid, order below minimum`
- State transitions: `SHIPPED → PAID: illegal (backwards)`
