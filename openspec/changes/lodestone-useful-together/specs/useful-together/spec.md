## ADDED Requirements

### Requirement: Papers found useful together but not known together lift each other in the owner's list

The system SHALL, when ranking prior art for a card's owner and at least
`PRIOR_MIN_CARDS` distinct cards of active members carry paper verdicts, add
to the candidates every paper B for which, for some paper A the owner marked
`useful` on that card, at least `TOGETHER_MIN` distinct active members other
than the owner marked both A and B `useful` on one card, and A and B are not
known together. Such a B SHALL be ordered as if its score were
`TOGETHER_BOOST` higher, SHALL NOT also receive `USEFUL_BOOST`, and SHALL
carry `via: { useful: A, together: n }`, where n is that member count. Its
`score` SHALL remain its best-block cosine. A B that is known together with
A, or whose link to A is unknown, SHALL get no boost and no `together`.
With the gate closed, or with no qualifying pair, the ranking SHALL be
identical to the ranking without this change.

#### Scenario: A surprise appears
- **WHEN** the owner marked A `useful`, three other active members each
  marked A and B `useful` on one of their cards, and neither paper cites the
  other nor shares references above `KNOWN_COUPLING`
- **THEN** B appears with `via: { useful: A, together: 3 }` and a `score`
  equal to its own cosine

#### Scenario: Two members are not enough
- **WHEN** only two other members co-marked A and B
- **THEN** B gets no boost and no `together`

#### Scenario: Known pairs are not surprises
- **WHEN** B cites A
- **THEN** B gets no `together` boost however many members co-marked them

#### Scenario: Revoked and self do not count
- **WHEN** one of three co-marking members is revoked, or one is the owner
- **THEN** the count is below `TOGETHER_MIN` and B gets no boost

#### Scenario: Near and together
- **WHEN** B is within `NEAR_USEFUL` of A and also a surprise
- **THEN** B carries `via.together` and is raised by one boost, not two

### Requirement: `via` stays readable by existing clients and private to the owner

`via.useful` SHALL keep naming the owner's useful paper that the hit came
through. `via.together` SHALL be optional, present only for a surprise, and
never below `TOGETHER_MIN`. A viewer who is not the owner SHALL see no
`via`. No verdict, person or card SHALL leave the server.

#### Scenario: An old client
- **WHEN** a client that reads only `via.useful` receives a surprise hit
- **THEN** its line "because you found A useful" is still true

#### Scenario: A cohort viewer
- **WHEN** another active member reads the owner's published card
- **THEN** no hit carries `via`, and no surprise candidate is added
