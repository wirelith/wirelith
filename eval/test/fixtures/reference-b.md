Add contact

```wirelith
wirelith 0.1

screen "Add contact" phone #add
  header
    button icon=arrow-left
    h3 "Add contact"
  input "First name"
  input "Last name"
  input "Phone number"
  input "Email" type=email
  toggle "Favourite"
  button "Save" primary
```

Pricing page

```wirelith
wirelith 0.1

screen "Pricing" desktop #pricing
  h1 "Pricing" align=center
  row justify=center
    toggle "Billed yearly" on
  grid cols=3
    card "Free"
      h2 "$0"
      list [One project, Basic support]
      button "Start for free"
    card "Team"
      badge "Most popular" primary
      h2 "$12"
      list [Unlimited projects, Shared spaces, Priority support]
      button "Choose Team" primary
    card "Business"
      h2 "$29"
      list [Everything in Team, Single sign-on, Audit log]
      button "Contact sales"
```

Users admin page

```wirelith
wirelith 0.1

screen "Users" desktop #users
  header
    h2 "Users"
    spacer
    button "Invite user" primary icon=plus
  row
    input placeholder="Search users" type=search grow
    select [Any role, Admin, Member] value="Any role"
    select [Any status, Active, Invited, Suspended] value="Any status"
  table [Name, Email, Role, Status, Last seen]
    row [Ada Park, ada@example.com, Admin, Active, Today]
    row [Luis Ortega, luis@example.com, Member, Invited, Never]
    row [Mei Tanaka, mei@example.com, Member, Active, Yesterday]

screen "Users" #users-empty of=#users state="No matches"
  header
    h2 "Users"
  empty "No users match these filters"
    button "Clear filters"
```

Booking flow

```wirelith
wirelith 0.1

screen "Choose a service" tablet #service
  h1 "Pebblebrook Dental"
  radio "Service" [Check-up, Cleaning, Filling] value="Cleaning"
  button "Next" primary -> #time

screen "Pick a date and time" tablet #time
  h1 "Pick a date and time"
  input "Date" type=date
  select "Time" ["9:00", "10:30", "14:00"] value="10:30"
  row justify=between
    button "Back" -> #service
    button "Next" primary -> #details

screen "Your details" tablet #details
  h1 "Your details"
  input "Name"
  input "Phone"
  input "Email" type=email
  row justify=between
    button "Back" -> #time
    button "Confirm booking" primary -> #confirm
  modal "Booking confirmed" #confirm
    text "We'll see you soon."
    button "Done" primary -> #service
```

File manager

```wirelith
wirelith 0.1
theme blueprint

screen "Filecove: Projects" desktop #files
  sidebar
    h3 "Filecove"
    list
      item "My files" icon=folder active
      item "Shared" icon=users
      item "Recent" icon=clock
      item "Trash" icon=trash
  breadcrumbs [My files, Projects, Spring launch]
  row
    button "Upload" primary icon=upload
    button "New folder" icon=folder-plus
    spacer
    input placeholder="Search files" type=search width=240
  grid cols=4
    card "brief.pdf" #first-file -> #file-details
      image "Preview" ratio=4:3
      label "1.2 MB" muted
    card "logo.png"
      image "Preview" ratio=4:3
      label "340 KB" muted
    card "plan.xlsx"
      image "Preview" ratio=4:3
      label "88 KB" muted
  drawer "brief.pdf" right #file-details
    image "Preview" ratio=4:3
    label "Size: 1.2 MB"
    label "Modified: yesterday"
    label "Owner: Mei Tanaka"
    row
      button "Download" icon=download
      button "Delete" danger icon=trash -> #confirm-delete
  modal "Delete brief.pdf?" #confirm-delete
    text "This can't be undone."
    row justify=end
      button "Cancel"
      button "Delete" danger
  note "Opens the details panel" for=#first-file
  note "Asks before deleting anything" for=#confirm-delete

screen "Filecove: Projects" #files-loading of=#files state="Loading"
  loading "Loading files"

screen "Filecove: Projects" #files-error of=#files state="Failed"
  error "We couldn't load your files"
    button "Try again" primary
```
