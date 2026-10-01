<!-- A DEFAULT, NOT A CONSTANT. Editing this file changes `prompt_version`
     on every resume run. -->

# Variant — resume

The text is one person's resume or short bio. Almost everything in it is
about the **person**; set `subject: person` unless a line is plainly about a
company's product rather than about them.

## What each part becomes

- **Every experience bullet** → `mechanism_commanded`: the capability the
  bullet demonstrates, in one clause ("ran dental procurement at a
  twelve-practice group"). One bullet, one assertion. A title alone is not a
  capability; the work under it is.
- **The domain a bullet names** → a `domain` assertion, when the bullet
  names an industry or setting rather than only a skill.
- **An objective or a project framing** → `purpose`, but only when the
  resume states one outright ("looking to build tools for independent
  clinics"). A list of jobs is not a purpose.
- **An explicit statement of what they are looking for** → `mechanism_sought`.
  Only when stated: a gap in the resume is not a request.
- **A number the person achieved** → `evidence` with the rung the *action*
  stands on: shipped, launched, sold, saved — `observed_behavior` when the
  resume records it happening, `incurred_cost` when they spent money or
  years on it.

## Absence

Declare `not_stated` only for facets a resume could reasonably carry and
this one does not — `mechanism_sought` when nothing is sought, `domain` when
no setting is named. **Do not** declare `purpose` as `not_stated`: a resume
is not expected to state one, and recording the absence would say the
question was asked and refused.
