// Canonical FAQ data for the /help page. Each entry references
// translation keys under 'help.qa.*' so questions and answers are
// fully localised. `roles` controls which role-filter chips show the
// item (and renders a small badge per Q so users see which audience
// the answer is for).

export type HelpRole = 'owner' | 'manager' | 'staff'

export interface HelpEntry {
  /** Stable id for accordion expand/collapse state. */
  id: string
  questionKey: string
  answerKey: string
  /** Roles this Q&A applies to. Used for both filter chips and the
   *  small role badges next to each question. */
  roles: HelpRole[]
}

export interface HelpSection {
  id: string
  titleKey: string
  entries: HelpEntry[]
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'basics',
    titleKey: 'sections.basics',
    entries: [
      {
        id: 'what_is',
        questionKey: 'qa.what_is_q',
        answerKey: 'qa.what_is_a',
        roles: ['owner', 'manager', 'staff'],
      },
      {
        id: 'why_daily',
        questionKey: 'qa.why_daily_q',
        answerKey: 'qa.why_daily_a',
        roles: ['owner', 'manager', 'staff'],
      },
    ],
  },
  {
    id: 'entry',
    titleKey: 'sections.entry',
    entries: [
      {
        id: 'what_to_enter',
        questionKey: 'qa.what_to_enter_q',
        answerKey: 'qa.what_to_enter_a',
        roles: ['manager', 'staff'],
      },
      {
        id: 'backdate',
        questionKey: 'qa.backdate_q',
        answerKey: 'qa.backdate_a',
        roles: ['manager', 'staff'],
      },
      {
        id: 'forget_cost',
        questionKey: 'qa.forget_cost_q',
        answerKey: 'qa.forget_cost_a',
        roles: ['manager', 'staff'],
      },
    ],
  },
  {
    id: 'notifications',
    titleKey: 'sections.notifications',
    entries: [
      {
        id: 'line_setup',
        questionKey: 'qa.line_setup_q',
        answerKey: 'qa.line_setup_a',
        roles: ['owner', 'manager'],
      },
      {
        id: 'morning_time',
        questionKey: 'qa.morning_time_q',
        answerKey: 'qa.morning_time_a',
        roles: ['owner', 'manager'],
      },
      {
        id: 'weekly',
        questionKey: 'qa.weekly_q',
        answerKey: 'qa.weekly_a',
        roles: ['owner'],
      },
    ],
  },
  {
    id: 'settings',
    titleKey: 'sections.settings',
    entries: [
      {
        id: 'add_team',
        questionKey: 'qa.add_team_q',
        answerKey: 'qa.add_team_a',
        roles: ['owner'],
      },
      {
        id: 'roles',
        questionKey: 'qa.roles_q',
        answerKey: 'qa.roles_a',
        roles: ['owner'],
      },
      {
        id: 'targets',
        questionKey: 'qa.targets_q',
        answerKey: 'qa.targets_a',
        roles: ['owner'],
      },
    ],
  },
]
