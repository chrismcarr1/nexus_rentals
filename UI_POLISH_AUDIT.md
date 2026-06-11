# Nexus UI Polish Audit

This pass preserves Nexus's navigation, workflows, page structure, and brand palette. Each item records the visible issue, the experience rationale, and the implementation shipped in this pass.

## Typography

| # | What felt unpolished | Why this improves the experience | Implemented change |
|---|---|---|---|
| 1 | Page titles had a neutral default tracking that felt less deliberate. | Tighter display tracking improves hierarchy without changing the typeface. | Refined `.page-title` weight, tracking, and line height in `app/globals.css`. |
| 2 | Page titles could become visually oversized relative to dense operational content. | A controlled responsive scale keeps attention on the title without crowding the viewport. | Set a narrower `clamp()` range for `.page-title`. |
| 3 | Eyebrows varied between components. | A shared eyebrow treatment makes page and section hierarchy predictable. | Added `.page-eyebrow` and `.section-eyebrow`. |
| 4 | Section titles used a generic semibold treatment. | Slightly stronger weight and tighter tracking improve scanability. | Added `.section-title` typography. |
| 5 | Detail section titles were small without enough authority. | A more deliberate weight separates section identity from body content. | Added `.detail-section-title`. |
| 6 | Descriptions used inconsistent maximum widths. | Controlled line length improves readability on wide screens. | Added width and line-height rules for page and section descriptions. |
| 7 | Metric labels used excessive letter spacing. | Calmer tracking reads faster in KPI grids. | Reduced tracking through `.metric-label` and `.stat-tile-label`. |
| 8 | Metric values lacked a consistent numeric treatment. | Tabular figures and tighter tracking make financial values easier to compare. | Added tabular numerals and refined tracking to `.metric-value` and `.stat-tile-value`. |
| 9 | Body copy inherited slightly loose visual spacing. | Subtle optical tuning makes dense SaaS screens feel cleaner. | Enabled supported font feature variants and refined body letter spacing. |
| 10 | Field labels varied in size and contrast. | Consistent labels reduce form-reading effort. | Standardized `.field-label` size, weight, color, and spacing. |

## Spacing

| # | What felt unpolished | Why this improves the experience | Implemented change |
|---|---|---|---|
| 11 | App content padding jumped between fixed values. | Fluid padding feels balanced across laptop and desktop widths. | Changed `.app-content-inner` to responsive `clamp()` padding. |
| 12 | Page header spacing was slightly compressed. | More separation gives titles and actions room without changing layout. | Refined `.page-header` gap and bottom padding. |
| 13 | Detail section headers and bodies used different visual rhythms. | Matching increments make stacked sections feel cohesive. | Normalized `.detail-section-header` and `.detail-section-body` padding. |
| 14 | KPI tiles felt vertically tight. | A modest minimum height creates a calmer scan pattern. | Increased `.stat-tile` and `.stat-card` minimum height. |
| 15 | Metric cards had inconsistent internal breathing room. | Consistent padding makes dashboards feel composed. | Standardized `.metric-card` padding and minimum height. |
| 16 | Sidebar brand spacing felt utilitarian. | Slightly more measured spacing improves first-impression quality. | Refined `.app-sidebar-brand` height and padding. |
| 17 | Sidebar groups were visually crowded. | More group separation clarifies navigation categories. | Increased `.sidebar-nav` group gap. |
| 18 | Filter controls sat too close together. | Slightly wider gaps improve control recognition. | Refined `.filter-bar` and `.filter-selects` gaps. |
| 19 | Empty states used one large fixed padding value. | Responsive padding keeps them intentional on both wide and narrow screens. | Added responsive `clamp()` padding to `.empty-state`. |
| 20 | Mobile content retained desktop-like gutters. | Smaller mobile gutters preserve usable width without feeling cramped. | Added mobile `.app-content-inner` padding overrides. |

## Surfaces And Cards

| # | What felt unpolished | Why this improves the experience | Implemented change |
|---|---|---|---|
| 21 | Panels were visually flat against the application background. | Very subtle depth improves grouping and trust without becoming decorative. | Added `--shadow-panel` and applied it to shared surfaces. |
| 22 | Border colors varied between older and newer components. | A single border scale makes the UI feel maintained as one system. | Refined `--line` and `--line-strong` tokens. |
| 23 | Panel and control radii were inconsistent. | A restrained 7-8px system feels modern while preserving Nexus's shape language. | Standardized `--radius-panel` and `--radius-control`. |
| 24 | Muted panels sometimes looked like disabled content. | A clearer neutral surface distinguishes grouping from disabled state. | Refined `.panel-muted` and `.list-surface` backgrounds. |
| 25 | Cards did not have a reusable surface identity. | A shared class keeps future cards aligned. | Added `.surface-card` through the `Card` primitive. |
| 26 | Interactive card behavior had no premium hover treatment. | Subtle lift and border emphasis clarify clickability. | Added hover behavior for linked or button-based `.surface-card` elements. |
| 27 | KPI groups ended abruptly at square outer corners. | A shared outer radius makes grouped metrics read as one component. | Added radius and shadow to `.ops-grid`. |
| 28 | Metric icons looked detached from their cards. | Matching border, surface, and shadow treatment integrates them into the card system. | Refined `.metric-icon`. |
| 29 | Empty states used a plain dashed box. | A restrained layered neutral background makes them feel intentional. | Refined `.empty-state` border and background. |
| 30 | Guide tips used large rounded translucent cards that did not match the app shell. | Matching core surfaces preserves product identity. | Replaced one-off guide styling with `.guide-tip`. |

## Tables

| # | What felt unpolished | Why this improves the experience | Implemented change |
|---|---|---|---|
| 31 | Table frames felt visually separate from cards. | Matching radius and border treatment creates continuity. | Refined `.data-table-frame`. |
| 32 | Table headers lacked enough contrast from rows. | A slightly distinct header surface improves column parsing. | Refined table header background. |
| 33 | Header typography was a little loose. | Tighter, stronger labels scan faster in dense registers. | Refined `.table-heading` size, weight, and tracking. |
| 34 | Row height felt compressed in operational tables. | Slightly taller rows improve readability without becoming spacious. | Increased `.table-cell` vertical padding. |
| 35 | Hover states changed only the background. | A subtle left accent gives stronger row orientation. | Added inset brand accent on `.table-row:hover`. |
| 36 | Keyboard focus inside rows was hard to track. | Focus-within treatment supports keyboard users and reduces action mistakes. | Added `.table-row:focus-within`. |
| 37 | Record links did not consistently signal interactivity. | Underline-on-hover is familiar and trustworthy. | Refined `.table-link` hover behavior. |
| 38 | Sort controls blended into static headings. | A contained hover state makes sortable columns discoverable. | Refined `.sort-link` hit area and hover background. |
| 39 | Horizontal table scrolling could feel uncontrolled. | Overscroll containment keeps table gestures from moving the whole page unexpectedly. | Added inline overscroll behavior to `.data-table-scroll`. |
| 40 | Horizontal scrollbars were visually heavy. | A slimmer inset thumb keeps overflow discoverable but quiet. | Refined table scrollbar styling. |

## Forms

| # | What felt unpolished | Why this improves the experience | Implemented change |
|---|---|---|---|
| 41 | Inputs, selects, and textareas had diverged treatments. | One field primitive creates immediate consistency. | Moved `Textarea` onto the shared `.field` treatment. |
| 42 | Password fields used a separate large-radius style. | Matching standard fields reduces visual drift on auth forms. | Updated `PasswordField` to use `.field`. |
| 43 | Controls were slightly short for comfortable tapping. | A 42px minimum height improves touch accuracy while staying dense. | Added `.field` minimum height. |
| 44 | Field hover state was barely visible. | A modest border change confirms interactivity. | Added `.field:hover` border refinement. |
| 45 | Focus state varied across form controls. | One brand focus ring builds trust and keyboard clarity. | Standardized `.field:focus` and `:focus-visible`. |
| 46 | Disabled controls relied on opacity. | A dedicated disabled surface stays legible and clearly unavailable. | Added explicit `.field:disabled` styling. |
| 47 | Invalid fields did not have a shared visual state. | Consistent error borders make correction faster. | Added `aria-invalid` and `:user-invalid` field states. |
| 48 | Placeholder contrast varied across components. | A shared placeholder tone improves readability and polish. | Standardized input and textarea placeholder color. |
| 49 | Textareas did not share a consistent reading rhythm. | A stable line height makes longer entries easier to review. | Added textarea line-height and resize behavior. |
| 50 | Select text could crowd the native arrow. | Additional end padding prevents label collisions. | Added select-specific field padding. |

## Buttons And Feedback

| # | What felt unpolished | Why this improves the experience | Implemented change |
|---|---|---|---|
| 51 | Button treatments were repeated rather than systemized. | Named variant classes make hierarchy consistent and maintainable. | Added `.ui-button` variant hooks in `Button`. |
| 52 | Primary buttons used a large diffuse shadow. | A tighter two-stage shadow feels more precise and premium. | Refined `.ui-button-primary` shadow. |
| 53 | Primary hover feedback was mostly color-only. | A one-pixel lift improves affordance without becoming animated decoration. | Added restrained hover lift. |
| 54 | Secondary buttons became too brand-heavy on hover. | Neutral hover feedback preserves clear primary hierarchy. | Refined `.ui-button-secondary:hover`. |
| 55 | Ghost buttons lacked a shared hover treatment. | Consistent neutral hover feedback clarifies low-emphasis actions. | Added `.ui-button-ghost:hover`. |
| 56 | Danger buttons used the same depth as primary actions. | A quieter shadow keeps destructive actions serious rather than promotional. | Refined `.ui-button-danger`. |
| 57 | Disabled buttons could retain hover depth. | Removing movement and shadow prevents false affordance. | Added disabled overrides for shared action buttons. |
| 58 | Submit buttons changed text but showed no activity indicator. | A spinner makes waiting states unmistakable. | Added `LoaderCircle` to `SubmitButton`. |
| 59 | Submit buttons did not expose busy state to assistive technology. | `aria-busy` communicates processing status. | Added `aria-busy` in `SubmitButton`. |
| 60 | Inline alerts used inconsistent radius and padding. | Shared alert geometry improves feedback consistency. | Refined `.page-alert`. |

## Sidebar And Top Bar

| # | What felt unpolished | Why this improves the experience | Implemented change |
|---|---|---|---|
| 61 | Sidebar separation relied on a hard border. | A restrained side shadow improves shell depth. | Refined `.app-sidebar` border and shadow. |
| 62 | Active navigation icons did not feel anchored. | A tinted icon container makes location recognition faster. | Added active `.sidebar-nav-icon` treatment. |
| 63 | Active navigation state was not exposed semantically. | `aria-current` improves navigation accessibility. | Added `aria-current="page"` in `SidebarItem`. |
| 64 | Sidebar rows were slightly short for touch use. | Taller rows improve tap accuracy. | Increased `.sidebar-nav-item` minimum height. |
| 65 | Sidebar hover and active fills were too similar. | Separate opacity levels improve navigation clarity. | Refined hover and current-page backgrounds. |
| 66 | Account trigger lacked a visible keyboard state. | Inset focus treatment keeps focus visible inside the dark sidebar. | Added focus styling to `.account-trigger`. |
| 67 | Account, alert, quick-action, and row menus used different shadows. | One menu elevation model makes overlays feel related. | Added `--shadow-menu` across menu surfaces. |
| 68 | Top bar looked flat and fully opaque while content scrolled beneath it. | A light blur and translucent surface improves spatial continuity. | Refined `.app-topbar`. |
| 69 | Search and utility actions were not grouped semantically for responsive control. | Named wrappers make the top bar adapt without moving workflows. | Added `.app-topbar-inner`, `.topbar-search`, and `.topbar-actions`. |
| 70 | Workspace name floated without visual separation. | A subtle divider clarifies context versus actions. | Refined `.workspace-chip`. |

## Menus, Uploads, And Empty States

| # | What felt unpolished | Why this improves the experience | Implemented change |
|---|---|---|---|
| 71 | Status badges had mixed corner shapes. | A shared pill silhouette improves status recognition. | Added `.status-badge` to the `Badge` primitive. |
| 72 | Row action buttons were easy to miss. | A bordered elevated hover state improves discoverability. | Refined `.row-actions-trigger`. |
| 73 | Row action items had small hit areas. | Taller menu rows reduce selection mistakes. | Increased `.row-action-item` height and padding. |
| 74 | Export menu items used a different radius and hover palette. | Reusing row actions keeps menus cohesive. | Updated `ReportExportMenu` items to `.row-action-item`. |
| 75 | Alert items visually ran together. | Quiet separators improve notification parsing. | Added sibling borders between `.alert-item` entries. |
| 76 | Upload areas used oversized radii and translucent white. | Matching app surfaces makes uploads feel native to Nexus. | Added `.upload-surface`. |
| 77 | Upload picker affordance was weak. | A bordered hover/focus-like response makes file selection obvious. | Added `.upload-picker` and hover state. |
| 78 | Uploaded files looked like generic gray pills. | Structured rows improve filename readability and action clarity. | Added `.upload-item`. |
| 79 | File removal was a small unlabeled icon. | A 32px target and accessible name improve safety. | Added `.upload-remove` and per-file `aria-label`. |
| 80 | Empty-state icon treatment looked generic. | Brand-tinted icon framing gives empty pages a finished feel. | Refined `.empty-state-icon`. |

## Responsive And Accessibility

| # | What felt unpolished | Why this improves the experience | Implemented change |
|---|---|---|---|
| 81 | Top bar stacked every child vertically on tablet widths. | Keeping search and actions in one row preserves the desktop workflow. | Overrode the top bar layout at `max-width: 900px`. |
| 82 | The top bar disappeared during long mobile pages. | Sticky utilities reduce navigation effort. | Made `.app-topbar` sticky on smaller screens. |
| 83 | Mobile filter selects remained in a wrapping flex row. | A one-column control stack prevents cramped labels. | Added mobile grid behavior for `.filter-selects`. |
| 84 | Mobile filter actions could become uneven widths. | Full-width actions improve tapping and visual balance. | Added mobile width rules for `.filter-actions`. |
| 85 | Page actions could wrap into irregular rows on narrow phones. | Vertical stacking keeps action hierarchy clear. | Added `max-width: 420px` page-action layout. |
| 86 | Quick action text competed with search space on very small screens. | Icon-only compact behavior preserves the same action in less space. | Added phone-sized `.quick-action-trigger` rules. |
| 87 | Detail and section headers could squeeze actions beside long titles. | Stacking at phone widths protects readability. | Added mobile column layout for section headers. |
| 88 | Focus treatment was not consistent outside form primitives. | A global visible focus ring supports keyboard navigation. | Added shared `:focus-visible` rules. |
| 89 | Tap highlight flashes made controls feel browser-default. | Removing the default flash keeps feedback inside the product system. | Disabled tap highlight on interactive elements. |
| 90 | Motion preferences were not respected globally. | Reduced-motion support improves comfort and accessibility. | Added `prefers-reduced-motion` overrides. |

## Page-Specific Refinements

| # | What felt unpolished | Why this improves the experience | Implemented change |
|---|---|---|---|
| 91 | Property creation relied on placeholder-only identification. | Visible labels improve completion speed and accessibility. | Added labels for property name, summary, amenities, and manager. |
| 92 | Expense creation relied heavily on placeholders. | Persistent labels reduce errors in a long form. | Added labels to every expense field. |
| 93 | Expense metadata used a separate stone palette. | Shared muted tokens preserve palette consistency. | Replaced stone text colors with Nexus tokens. |
| 94 | Expense tags looked unrelated to status and metadata chips. | Shared chip geometry improves cohesion. | Restyled expense tags with `.status-badge`. |
| 95 | Assessment creation fields lacked persistent labels. | Labels make technical intake easier to review. | Added labels for unit, lease, date, and notes. |
| 96 | Assessment summary text used off-system neutral colors. | Shared text tokens maintain contrast consistency. | Updated assessment copy to Nexus muted colors. |
| 97 | Assessment facts used oversized rounded blocks. | Compact bordered facts improve scanability. | Added `.assessment-fact`. |
| 98 | Address suggestions used a large consumer-style popover. | A compact menu treatment better matches the SaaS shell. | Added `.address-suggestions` and `.address-suggestion`. |
| 99 | Search inputs behaved as plain text fields. | Search semantics improve browser behavior and accessibility. | Added `type="search"` and disabled autocomplete in shared search fields. |
| 100 | Filter-heavy pages required manually clearing each control. | A visible reset action speeds recovery from narrow result sets. | Added conditional `Reset` behavior to `FilterBar`. |
