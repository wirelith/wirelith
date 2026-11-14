### 1. Add contact (phone)

```wirelith
wirelith 0.1

screen "Add contact" phone #add-contact
  header
    button icon=arrow-left sm
    h2 "Add contact"
  column gap=md pad=md
    input "First name" placeholder="Jane" required
    input "Last name" placeholder="Doe"
    input "Phone number" type=text placeholder="+1 555 0100"
    input "Email" type=email placeholder="jane@example.com"
    toggle "Favourite"
    spacer
    button "Save" primary width=fill
```

### 2. Pricing page (desktop)

```wirelith
wirelith 0.1

screen "Pricing" desktop #pricing
  header
    h3 "Taskloom"
    spacer
    nav [Product, Pricing, Docs] active="Pricing"
    button "Sign in"
  column align=center gap=lg pad=xl
    h1 "Simple pricing for every team"
    text "Start free and upgrade when your team grows." muted
    row gap=sm align=center
      label "Monthly"
      toggle
      label "Yearly (save 20%)"
    grid cols=3 gap=lg width=fill
      card "Free"
        h2 "$0 / month"
        text "For individuals getting started." muted
        list [1 project, Up to 2 members, Community support]
        button "Get started" width=fill
      card "Team"
        badge "Most popular" primary
        h2 "$12 / user / month"
        text "For growing teams that work together." muted
        list [Unlimited projects, Up to 50 members, Shared calendars, Email support]
        button "Start free trial" primary width=fill
      card "Business"
        h2 "$29 / user / month"
        text "For organisations with advanced needs." muted
        list [Everything in Team, SSO and audit logs, Unlimited members, Priority support]
        button "Contact sales" width=fill
```

### 3. Admin users page (desktop)

```wirelith
wirelith 0.1

screen "Users" desktop #users
  header
    h2 "Users"
    spacer
    button "Invite user" primary icon=plus -> #invite
  row gap=sm pad=md align=end
    input "Search" placeholder="Search by name or email" type=search width=320
    select "Role" [All roles, Admin, Editor, Viewer] value="All roles"
    select "Status" [All statuses, Active, Invited, Suspended] value="All statuses"
  table [Name, Email, Role, Status, Last seen]
    row [Ada Park, ada@example.com, Admin, Active, 5 minutes ago]
    row [Luis Ortega, luis@example.com, Editor, Active, 2 hours ago]
    row [Mina Shah, mina@example.com, Viewer, Invited, Never]
    row [Tom Reyes, tom@example.com, Editor, Suspended, 3 weeks ago]
    row [Grace Kim, grace@example.com, Viewer, Active, Yesterday]
  modal "Invite user" #invite
    input "Email" type=email placeholder="name@example.com" required
    select "Role" [Admin, Editor, Viewer] value="Viewer"
    row justify=end gap=sm
      button "Cancel" -> #users
      button "Send invite" primary -> #users

screen "Users" desktop #users-empty of=#users state="No matches"
  header
    h2 "Users"
    spacer
    button "Invite user" primary icon=plus
  row gap=sm pad=md align=end
    input "Search" type=search value="zzq" width=320
    select "Role" [All roles, Admin, Editor, Viewer] value="Admin"
    select "Status" [All statuses, Active, Invited, Suspended] value="Suspended"
  empty "No users match these filters"
    button "Clear filters" -> #users
```

### 4. Dental clinic booking flow (tablet)

```wirelith
wirelith 0.1

screen "Choose a service" tablet #service
  header
    h2 "Brightsmile Dental"
    spacer
    label "Step 1 of 3"
  column gap=lg pad=lg
    h1 "Choose a service"
    radio "Service" [Check-up and clean, Teeth whitening, Filling, Emergency visit] value="Check-up and clean"
    text "Not sure what you need? Choose a check-up and we will advise you." muted
    row justify=end
      button "Next" primary icon=chevron-right -> #datetime

screen "Pick a date and time" tablet #datetime
  header
    h2 "Brightsmile Dental"
    spacer
    label "Step 2 of 3"
  column gap=lg pad=lg
    h1 "Pick a date and time"
    select "Dentist" [Any dentist, Dr. Mina Shah, Dr. Tom Reyes] value="Any dentist"
    input "Date" type=date value="12 June 2025"
    label "Available times"
    grid cols=4 gap=sm
      button "9:00"
      button "9:30"
      button "10:30" primary
      button "11:00"
      button "13:30"
      button "14:00"
      button "15:30" disabled
      button "16:00"
    row justify=between
      button "Back" icon=arrow-left -> #service
      button "Next" primary icon=chevron-right -> #details

screen "Your details" tablet #details
  header
    h2 "Brightsmile Dental"
    spacer
    label "Step 3 of 3"
  column gap=lg pad=lg
    h1 "Your details"
    card "Your appointment"
      text "Check-up and clean"
      text "Thursday 12 June at 10:30 with any dentist" muted
    input "Full name" placeholder="Jane Doe" required
    input "Phone" type=text placeholder="+1 555 0100" required
    input "Email" type=email placeholder="jane@example.com"
    textarea "Notes for the dentist" placeholder="Anything we should know?" rows=3
    checkbox "Send me a reminder by text message" checked
    row justify=between
      button "Back" icon=arrow-left -> #datetime
      button "Confirm booking" primary -> #confirmed
  modal "Booking confirmed" #confirmed
    icon "check"
    text "Your check-up is booked for Thursday 12 June at 10:30. We have sent the details to your phone."
    row justify=end
      button "Done" primary -> #service
```

### 5. File manager with loading and error states (desktop)

```wirelith
wirelith 0.1
theme blueprint

screen "My files" desktop #files
  row height=fill
    sidebar
      h3 "Cloudnest"
      list
        item "My files" icon=folder active
        item "Shared with me" icon=users
        item "Recent" icon=clock
        item "Starred" icon=star
        item "Trash" icon=trash
      spacer
      label "12.4 GB of 50 GB used"
    column grow gap=md pad=lg
      breadcrumbs [My files, Marketing, 2025]
      row gap=sm align=center
        button "Upload" primary icon=upload #upload
        button "New folder" icon=folder-plus
        spacer
        input placeholder="Search in this folder" type=search width=280
      grid cols=4 gap=md #file-grid
        card
          image "PDF thumbnail" ratio=4:3
          link "Q3 report.pdf" -> #file-details
          label "2.4 MB"
        card
          image "Spreadsheet thumbnail" ratio=4:3
          link "Budget 2025.xlsx" -> #file-details
          label "860 KB"
        card
          image "Photo of a beach" ratio=4:3
          link "Team offsite.jpg" -> #file-details
          label "4.1 MB"
        card
          image "PDF thumbnail" ratio=4:3
          link "Brand guidelines.pdf" -> #file-details
          label "12 MB"
        card
          image "Document thumbnail" ratio=4:3
          link "Meeting notes.docx" -> #file-details
          label "48 KB"
        card
          image "Logo sketch" ratio=4:3
          link "Logo draft.png" -> #file-details
          label "1.2 MB"
        card
          image "Video still" ratio=4:3
          link "Launch video.mp4" -> #file-details
          label "220 MB"
        card
          image "Slide thumbnail" ratio=4:3
          link "Campaign deck.pptx" -> #file-details
          label "6.8 MB"
  drawer "Q3 report.pdf" right #file-details
    image "PDF preview" ratio=4:3
    table [Property, Value]
      row [Type, PDF document]
      row [Size, 2.4 MB]
      row [Location, My files / Marketing / 2025]
      row [Owner, Ada Park]
      row [Modified, 3 June 2025]
    row gap=sm
      button "Download" primary icon=download
      button "Delete" danger icon=trash -> #confirm-delete
  modal "Delete Q3 report.pdf?" #confirm-delete
    text "The file will be moved to Trash and removed after 30 days."
    row justify=end gap=sm
      button "Cancel" -> #file-details
      button "Delete" danger -> #files
  note "Clicking a file name opens the details panel on the right" for=#file-grid
  note "Upload accepts files up to 2 GB; files can also be dropped onto the grid" for=#upload

screen "My files" desktop #files-loading of=#files state="Loading"
  row height=fill
    sidebar
      h3 "Cloudnest"
      list
        item "My files" icon=folder active
        item "Shared with me" icon=users
        item "Recent" icon=clock
        item "Starred" icon=star
        item "Trash" icon=trash
      spacer
      label "12.4 GB of 50 GB used"
    column grow gap=md pad=lg
      breadcrumbs [My files, Marketing, 2025]
      row gap=sm align=center
        button "Upload" primary icon=upload disabled
        button "New folder" icon=folder-plus disabled
        spacer
        input placeholder="Search in this folder" type=search width=280 disabled
      loading

screen "My files" desktop #files-error of=#files state="Load failed"
  row height=fill
    sidebar
      h3 "Cloudnest"
      list
        item "My files" icon=folder active
        item "Shared with me" icon=users
        item "Recent" icon=clock
        item "Starred" icon=star
        item "Trash" icon=trash
      spacer
      label "12.4 GB of 50 GB used"
    column grow gap=md pad=lg
      breadcrumbs [My files, Marketing, 2025]
      row gap=sm align=center
        button "Upload" primary icon=upload disabled
        button "New folder" icon=folder-plus disabled
        spacer
        input placeholder="Search in this folder" type=search width=280 disabled
      column align=center gap=md pad=xl
        error "We couldn't load this folder. Check your connection and try again."
        button "Retry" primary icon=refresh-cw -> #files-loading
```
