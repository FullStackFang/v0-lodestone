## ADDED Requirements

### Requirement: Operators manage the roster

The system SHALL serve `/lodestone/roster` to operators, where an operator is
a person whose email is in `PILOT_OPERATOR_EMAILS` or whose membership kind
is `operator`, the one predicate `/lodestone/map` and every membership
action use. It SHALL list every roster row (email, kind, state, invited,
accepted, revoked, delivery status) and offer: invite by email, renew,
revoke. Inviting SHALL create an invitation expiring in fourteen days and
deliver one email carrying an accept link, recording whether delivery
succeeded.
Revoking SHALL call the existing cascade so the member's cards leave every
list without a row being deleted. A non-operator SHALL receive the same denial
`/lodestone/map` gives.

#### Scenario: An invitation is sent
- **WHEN** an operator invites `a@example.edu`
- **THEN** one roster row exists in state `invited` and one email to that
  address carries a link of the form `/lodestone/join/<token>`

#### Scenario: A revoke empties the lists
- **WHEN** an operator revokes a member with a published card
- **THEN** the card is absent from the map, from every peer list and from the
  digest, and the `forge_card` row still exists

#### Scenario: Not an operator
- **WHEN** a signed-in non-operator requests `/lodestone/roster`
- **THEN** the response is the denial `/lodestone/map` gives

#### Scenario: A membership-kind operator can invite
- **WHEN** a person enrolled with kind `operator` but absent from
  `PILOT_OPERATOR_EMAILS` invites someone
- **THEN** the invitation is created

### Requirement: An invitee accepts by link

The system SHALL serve `/lodestone/join/[token]`, requiring sign-in. When the
signed-in email matches the invitation and the token is current it SHALL
accept the invitation and redirect to `/lodestone`. Otherwise it SHALL show
the reason (sent to someone else, expired, already used) and enrol no one.

#### Scenario: The right person accepts
- **WHEN** `a@example.edu` signs in and opens their link
- **THEN** they land on `/lodestone` as an active member and can publish a card

#### Scenario: Someone else opens it
- **WHEN** `b@example.edu` opens `a@example.edu`'s link
- **THEN** the page says the invitation was sent to someone else and `b@` is
  not enrolled

#### Scenario: Expired
- **WHEN** a token past its expiry is opened by its addressee
- **THEN** the page says it expired and names the operator to ask for a renewal
