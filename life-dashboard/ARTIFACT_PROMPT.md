Build me a personal Life Dashboard as an interactive artifact. It is only for me, nobody else will use it. I'll open it every morning, mostly on my laptop, sometimes on my phone.

## Storage and data

- Save everything in the artifact's own database so it persists across my devices. Do not use localStorage for my data.
- Every target comes from a plan object stored in the database (seeded below), never hardcoded in the page, so I can change my plan without touching code.
- Add a small "Edit plan" link at the bottom of the page that opens the plan as JSON text. I can edit it and save. If the JSON is invalid, show what's wrong and don't save.
- Data shape:
  - days: { "2026-11-25": [ {text, done, category} ] }
  - weeks: { "2026-11-23": { "TRUFF": [ {text, done} ] } } (week keys are the Monday)
  - quarters: { "Y1 Q1": { focus: [ {text, done} ] } }
  - months: { "2026-11": { revenue, profit, ownerPay, quinnFollowers, quinnIncome } }
  - config: { projects, todayCategories, plan }

## Layout

Three tabs at the top: Today, This Week, This Month. Today opens by default. The tab doesn't need to be remembered.

## Today

Header: today's date (for example "Wednesday, November 25") and a count across all groups like "4 of 7 done".

Two columns on a laptop, stacked on a phone:

**Left: Calendar.** Today's events from my connected Google Calendar, read live each time I open the page. Read-only. Show the time (or "All day") and the title. Leave out events I declined. Fade events that are already over. If nothing is on the calendar, say "Nothing on the calendar today."

**Right: three task groups**, in this order: TRUFF, Quinn, Freelance. These come from config.todayCategories, each with a limit of 3 tasks.
- Each group has one input: type and press Enter to add. Click a task to check it off. X to delete.
- Once a group has 3 tasks (checked or not), its input locks and says "3 tasks, that's today".
- Each group header shows its own "1 of 3" count.
- Unchecked tasks roll to the next day automatically and stay in their group. Checked tasks stay visible until the day ends, then clear.
- No priorities, tags, due dates, subtasks or reordering.

## This Week

Header: "Week N of Y1 Q1" plus the date range (for example "Nov 23 to Nov 29"). Week 1 is the week (Monday start) that contains the quarter's first day. So Nov 23, 2026 is Week 5 of Y1 Q1, because Nov 1, 2026 is a Sunday.

**Top panel, This Quarter's Focus:** the active quarter's label, its on-track line ("On track: ..."), and its focus items from the plan as checkboxes. These stay checked for the whole quarter and don't reset weekly. Match checked state to the item text, so if I edit the plan's focus list, the panel follows the plan.

**Projects:** one card per project from config.projects (TRUFF, Sasha's Roots, Modern Dose, Eat With Quinn, The Citrus Creative). Each holds up to 5 items for the week, with the same add / check / delete interaction as Today. The input locks at 5. The week resets on Monday: unchecked items roll into the new week, checked ones clear.

## This Month

The scoreboard. Numbers are the loudest thing on this view.

Header: the active quarter label (for example "Y1 Q1 Set up"), then "Month 1 of 3", then the quarter's on-track line.

Five metrics, each row showing: name, a short line saying what it's compared against, the current number (big), the target, a status word, and an input for this month's number.

- **Recurring revenue** and **Quinn followers:** monthly targets. Compare this month's number to the active quarter's target.
- **Owner pay** and **Quinn income:** annual targets. Compare year-to-date to the active plan year's annual target. Year-to-date sums every entered month from the plan year's first month through this month.
- **Profit:** no target. Show the number and the change vs last month (for example "+$300 vs Oct").

Status words:
- "on track" when current is at or above target
- "behind" when below
- "no target this period" when the plan has no target for the active period
- "not entered yet" when I haven't typed a number

An annual metric only counts as on track once year-to-date reaches the full annual target. Don't prorate it by month.

Below the metrics:

1. **TRUFF exit runway:** "Exit runway: 2 of 6 months above $11,250." Count consecutive recent months where recurring revenue was at or above plan.exitTrigger. Start counting from this month if I've entered its revenue, otherwise from last month. Any month below the trigger, or with no number, ends the run. The "6" comes from plan.exitRunwayMonths.
2. **Twelve-month history:** a table, one row per month (this month and the 11 before it), all five metrics. Each cell is an input so I can type past months' numbers. Rows, not charts. Let it scroll sideways on a phone.

## Date logic

- Active quarter: the quarter whose start and end months include today's month (both ends inclusive).
- Active plan year: the first year (sorted by checkpoint) whose checkpoint month is on or after today's month.
- A plan year starts the month after the previous year's checkpoint. The first plan year starts at the first quarter's start (2026-11). So plan year 2027 runs Nov 2026 to Nov 2027, and 2028 runs Dec 2027 to Nov 2028.
- November 2027 belongs to Y1 Q4 (the quarter wins over the year).
- Quarters only exist for Year 1. From December 2027 on, use the active plan year's targets and label the headers with the year (for example "2028 Go full-time", "Month 1 of 12", "Checkpoint November 2028") instead of a quarter. If no quarter is active, the focus panel says the plan has no quarter for this period.
- Never interpolate or invent a target. If the period has no number for a metric, it's "no target this period".
- Check the date every minute and when I come back to the tab, so the rollovers happen even if the page stays open overnight.

## Seed data

Seed the database with this config. days, weeks, quarters and months all start empty.

```json
{
  "projects": ["TRUFF", "Sasha's Roots", "Modern Dose", "Eat With Quinn", "The Citrus Creative"],
  "todayCategories": [
    { "name": "TRUFF", "limit": 3 },
    { "name": "Quinn", "limit": 3 },
    { "name": "Freelance", "limit": 3 }
  ],
  "plan": {
    "exitTrigger": 11250,
    "exitRunwayMonths": 6,
    "baseline": { "month": "2026-11", "revenue": 8000, "retainers": 2, "quinnFollowers": 2890 },
    "quarters": [
      { "label": "Y1 Q1 Set up", "start": "2026-11", "end": "2027-01",
        "revenue": 9000, "quinnFollowers": 4500,
        "onTrack": "$9K/month and 4,500 Quinn followers",
        "focus": [
          "Review pricing, package services, raise rates or add scope with 1 client",
          "Kick off Sasha's Roots and Modern Dose in December",
          "Quinn content calendar, 3 posts every week",
          "Start a monthly tracker"
        ] },
      { "label": "Y1 Q2 Grow", "start": "2027-02", "end": "2027-04",
        "revenue": 10000, "quinnFollowers": 6000,
        "onTrack": "$10K/month and 6K followers",
        "focus": [
          "Land 1 new retainer through referrals or the website",
          "Tighten onboarding and reporting",
          "Poll the Quinn audience and test 3 offer ideas"
        ] },
      { "label": "Y1 Q3 Build", "start": "2027-05", "end": "2027-07",
        "revenue": 11000, "quinnFollowers": 8000,
        "onTrack": "$11K/month, 8K followers, first brand deal",
        "focus": [
          "Pick the Quinn offer based on what people wanted, build it and its sales page",
          "Quinn media kit, pitch 5 brands",
          "Write down which tasks a contractor could take on"
        ] },
      { "label": "Y1 Q4 Hit it", "start": "2027-08", "end": "2027-11",
        "revenue": 12000, "quinnFollowers": 10000,
        "onTrack": "$12K/month, 10K followers, first offering has sales",
        "focus": [
          "Launch the paid Quinn offering",
          "Get recurring agency revenue to $12K/month",
          "Review profit, set 2028 targets including the TRUFF exit date"
        ] }
    ],
    "years": [
      { "label": "2027 Build the foundation", "checkpoint": "2027-11",
        "revenue": 12000, "quinnFollowers": 10000, "team": 0 },
      { "label": "2028 Go full-time", "checkpoint": "2028-11",
        "revenue": 11250, "quinnFollowers": 20000, "quinnIncomeAnnual": 10000,
        "annualRevenue": [150000, 175000], "ownerPayAnnual": 100000, "team": 1 },
      { "label": "2029 Delegate", "checkpoint": "2029-11",
        "revenue": 15000, "quinnFollowers": 30000, "quinnIncomeAnnual": 25000,
        "annualRevenue": [175000, 200000], "ownerPayAnnual": 120000, "team": 2 },
      { "label": "2030 Scale", "checkpoint": "2030-11",
        "quinnFollowers": 40000, "quinnIncomeAnnual": 40000,
        "annualRevenue": [190000, 225000], "ownerPayAnnual": 135000, "team": 3 },
      { "label": "2031 Arrive", "checkpoint": "2031-11",
        "quinnFollowers": 50000, "quinnFollowersStretch": 100000, "quinnIncomeAnnual": 50000,
        "annualRevenue": [200000, 249000], "ownerPayAnnual": 150000, "team": 4 }
    ]
  }
}
```

## Design

- Calm and legible. Generous whitespace. One accent color.
- Colors: background #FAFAF7, text #3C1F0C, accent #751A47 (eggplant), soft panel #F5EFE4, lines #EBE5DB, muted text #8A7A6D.
- A serif (Palatino or Georgia style) for page titles and the big numbers. A clean sans for everything else.
- Tasks are round checkboxes that fill with the accent color when checked.
- "on track" is a filled accent pill, "behind" an outlined pill, and the other statuses plain muted text.
- Single light theme is fine. Works at laptop width and stacks cleanly on a phone.

## Do not build

- No login, accounts or sharing features
- No charts or graphs
- No notifications, reminders or email
- No integrations other than reading today's Google Calendar events
- No separate yearly or five-year view
- No onboarding or goal-setting wizard
- No dark mode toggle
- No task priorities, tags, due dates or subtasks
- No editing past months beyond typing a number

After you build it, check these and tell me the results:
1. Today, Nov 25, 2026 shows "Y1 Q1 Set up", "Month 1 of 3", and "Week 5 of Y1 Q1".
2. Owner pay and Quinn income show "no target this period" right now.
3. Typing a number in the history table updates the scoreboard.
