# 1. Add contact (phone)

```wirelith
wirelith 0.1

screen "Add contact" phone #add-contact
  header
    button icon=x
    spacer
    h3 "Add contact"
    spacer
  column pad=md gap=md
    avatar "New contact"
    input "First name" required
    input "Last name"
    input "Phone number" type=number required
    input "Email" type=email
    row align=center justify=between
      text "Favourite"
      toggle
    button "Save" primary lg width=fill
```

# 2. Pricing page (desktop)

```wirelith
wirelith 0.1

screen "Pricing" desktop #pricing
  header
    h3 "Plannly"
    spacer
    nav [Product, Pricing, Help] active="Pricing"
    button "Sign in"
  column align=center gap=lg pad=xl
    h1 "Simple pricing for every team"
    text "Start free and upgrade when you need more." muted
    row align=center gap=sm justify=center
      label "Monthly"
      toggle
      label "Yearly"
      badge success "Save 20%"
    row gap=lg align=stretch width=fill
      card "Free" grow
        h1 "$0"
        text "per month" muted
        divider
        list [1 project, 3 collaborators, Community support]
        button "Get started" width=fill
      card "Team" #team grow
        badge primary "Most popular"
        h1 "$29"
        text "per month" muted
        divider
        list [Unlimited projects, 20 collaborators, Priority email support]
        button "Start free trial" primary width=fill
      card "Business" grow
        h1 "$79"
        text "per month" muted
        divider
        list [Unlimited everything, Single sign-on, Dedicated manager]
        button "Contact sales" width=fill
  note "Highlighted plan: the one we want most people to choose" for=#team
```

# 3. Admin Users page (desktop)

```wirelith
wirelith 0.1

screen "Users" desktop #users
  header
    h2 "Users"
    spacer
    button "Invite user" primary icon=plus
  column pad=md gap=md
    row gap=sm align=center
      input placeholder="Search users" type=search width=280
      select "Role" [All roles, Admin, Editor, Viewer] value="All roles"
      select "Status" [All statuses, Active, Invited, Suspended] value="All statuses"
    table [Name, Email, Role, Status, Last seen]
      row [Ada Park, ada@example.com, Admin, Active, Today]
      row [Luis Ortega, luis@example.com, Editor, Active, Yesterday]
      row [Mei Tanaka, mei@example.com, Viewer, Invited, Never]
      row [Sam Okafor, sam@example.com, Editor, Suspended, 3 weeks ago]
      row [Nora Lind, nora@example.com, Viewer, Active, 2 hours ago]

screen "Users" desktop #users-empty of=#users state="No results"
  header
    h2 "Users"
    spacer
    button "Invite user" primary icon=plus
  column pad=md gap=md
    row gap=sm align=center
      input placeholder="Search users" type=search value="zzz" width=280
      select "Role" [All roles, Admin, Editor, Viewer] value="Admin"
      select "Status" [All statuses, Active, Invited, Suspended] value="Suspended"
    empty "No users match your filters"
      button "Clear filters" -> #users
```

# 4. Dental clinic booking flow (tablet)

```wirelith
wirelith 0.1

screen "Choose a service" tablet #service
  header
    h3 "Brightleaf Dental"
    spacer
    label "Step 1 of 3"
  column pad=lg gap=md
    h2 "Choose a service"
    radio "Service" [Check-up and clean, Filling, Teeth whitening, Emergency visit] value="Check-up and clean"
    text "Not sure what you need? Call us and we will help." muted
    row justify=end gap=sm
      button "Continue" primary -> #datetime

screen "Pick a date and time" tablet #datetime
  header
    h3 "Brightleaf Dental"
    spacer
    label "Step 2 of 3"
  column pad=lg gap=md
    h2 "Pick a date and time"
    input "Date" type=date required
    radio "Time" [09:00, 10:30, 13:00, 15:30] value="10:30"
    row justify=between
      button "Back" -> #service
      button "Continue" primary -> #details

screen "Your details" tablet #details
  header
    h3 "Brightleaf Dental"
    spacer
    label "Step 3 of 3"
  column pad=lg gap=md
    h2 "Your details"
    input "Full name" required
    input "Email" type=email required
    input "Phone" type=number
    textarea "Notes for the dentist" rows=3
    row justify=between
      button "Back" -> #datetime
      button "Confirm booking" primary -> #confirmed
  modal "Booking confirmed" #confirmed
    icon "check"
    text "Your appointment is booked. We have sent a confirmation to your email."
    row justify=end
      button "Done" primary -> #service
```

# 5. File manager (desktop)

```wirelith
wirelith 0.1
theme blueprint

screen "Files" desktop #files
  row height=fill
    sidebar
      h3 "Cloudnest"
      label "Locations"
      nav [My files, Shared with me, Recent, Starred, Trash] vertical active="My files"
    column grow pad=md gap=md
      breadcrumbs [My files, Projects, Brand assets]
      row gap=sm align=center
        button "Upload" primary icon=upload #upload
        button "New folder" icon=plus
        spacer
        input placeholder="Search files" type=search width=240
      grid cols=3 gap=md
        card
          image "Preview of logo-final.png" ratio=4:3
          link "logo-final.png" #first-file -> #details
          label "1.2 MB"
        card
          image "Preview of brand-guide.pdf" ratio=4:3
          link "brand-guide.pdf" -> #details
          label "4.8 MB"
        card
          image "Preview of banner.jpg" ratio=4:3
          link "banner.jpg" -> #details
          label "860 KB"
        card
          image "Preview of colours.png" ratio=4:3
          link "colours.png" -> #details
          label "240 KB"
        card
          image "Preview of intro.mp4" ratio=4:3
          link "intro.mp4" -> #details
          label "48 MB"
        card
          image "Preview of icons.zip" ratio=4:3
          link "icons.zip" -> #details
          label "2.1 MB"
  drawer "File details" right #details
    image "Preview of logo-final.png" ratio=4:3
    h3 "logo-final.png"
    list
      item "Type: PNG image"
      item "Size: 1.2 MB"
      item "Modified: 12 May 2025"
      item "Owner: Ada Park"
    row gap=sm
      button "Download" primary icon=download
      button "Delete" danger icon=trash -> #delete
  modal "Delete this file?" #delete
    text "logo-final.png will be moved to the trash."
    row justify=end gap=sm
      button "Cancel" -> #files
      button "Delete" danger -> #files
  note "Uploads go into the folder shown in the breadcrumbs" for=#upload
  note "Click a file name to open its details panel" for=#first-file

screen "Files" desktop #files-loading of=#files state="Loading"
  row height=fill
    sidebar
      h3 "Cloudnest"
      label "Locations"
      nav [My files, Shared with me, Recent, Starred, Trash] vertical active="My files"
    column grow pad=md gap=md
      breadcrumbs [My files, Projects, Brand assets]
      row gap=sm align=center
        button "Upload" primary icon=upload
        button "New folder" icon=plus
        spacer
        input placeholder="Search files" type=search width=240
      loading

screen "Files" desktop #files-error of=#files state="Failed to load"
  row height=fill
    sidebar
      h3 "Cloudnest"
      label "Locations"
      nav [My files, Shared with me, Recent, Starred, Trash] vertical active="My files"
    column grow pad=md gap=md
      breadcrumbs [My files, Projects, Brand assets]
      row gap=sm align=center
        button "Upload" primary icon=upload
        button "New folder" icon=plus
        spacer
        input placeholder="Search files" type=search width=240
      error "We could not load your files."
        button "Retry" primary -> #files-loading
```
