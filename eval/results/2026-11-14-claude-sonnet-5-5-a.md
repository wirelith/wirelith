## 1. Phone sign-up

```wirelith
wirelith 0.1

screen "Sign up" phone #signup
  column pad=lg gap=md
    h1 "Create account"
    text "Join in less than a minute." muted
    input "Name" placeholder="Full name" required
    input "Email" type=email placeholder="you@example.com" required
    input "Password" type=password placeholder="At least 8 characters" required
    checkbox "I accept the terms and conditions"
    button "Create account" primary lg width=fill
    link "Already have an account? Log in"
```

## 2. Desktop account settings

```wirelith
wirelith 0.1

screen "Account settings" desktop #settings
  header
    h2 "Account settings"
  column pad=lg gap=md
    tabs [Profile, Security, Notifications] active="Profile"
      column gap=md width=480 pad=md
        row align=center gap=md
          avatar "Ada Park"
          button "Change photo" sm
        input "Name" value="Ada Park"
        input "Email" type=email value="ada@example.com"
        textarea "Short bio" rows=4 placeholder="Tell us a little about yourself"
        select "Time zone" [UTC, Europe/London, America/New_York, Asia/Tokyo] value="Europe/London"
        row justify=end gap=sm
          button "Cancel"
          button "Save" primary
```

## 3. Desktop email inbox

```wirelith
wirelith 0.1

screen "Inbox" desktop #inbox
  header
    h3 "Mail"
    spacer
    input placeholder="Search mail" type=search width=320
    button "Compose" primary icon=plus
  row grow
    sidebar
      list
        item "Inbox" active icon=inbox
        item "Starred" icon=star
        item "Sent" icon=send
        item "Drafts" icon=file
        item "Updates" icon=bell badge="5"
        item "Trash" icon=trash
    column grow pad=md gap=md
      table [Sender, Subject, Date]
        row [Luis Ortega, Quarterly planning notes, 9:42 AM]
        row [Ada Park, Design review on Friday, 8:15 AM]
        row [Billing Team, Your invoice is ready, Yesterday]
        row [Priya Nair, Re: Launch checklist, Yesterday]
        row [Sam Whitfield, Lunch next week?, Mon]
      row justify=between
        button "Previous" disabled
        button "Next"
```

## 4. Phone checkout flow

```wirelith
wirelith 0.1

screen "Cart" phone #cart
  header
    h2 "Cart"
  column pad=md gap=md
    card "Canvas tote bag"
      row align=center gap=md
        image "Product photo" width=64 height=64
        text "Qty 1" muted
        spacer
        text "$24.00"
    card "Ceramic mug"
      row align=center gap=md
        image "Product photo" width=64 height=64
        text "Qty 2" muted
        spacer
        text "$26.00"
    divider
    row
      text "Total"
      spacer
      h3 "$50.00"
    button "Continue to shipping" primary lg width=fill -> #shipping

screen "Shipping address" phone #shipping
  header
    button "Back" icon=arrow-left sm -> #cart
    h2 "Shipping address"
  column pad=md gap=md
    input "Full name" placeholder="Full name" required
    input "Street address" placeholder="Street and number" required
    input "City" placeholder="City" required
    input "Postcode" placeholder="e.g. 90210" required
    button "Place order" primary lg width=fill -> #confirmed

screen "Shipping address" phone #shipping-error of=#shipping state="Invalid postcode"
  header
    button "Back" icon=arrow-left sm -> #cart
    h2 "Shipping address"
  column pad=md gap=md
    error "Please fix the highlighted field."
    input "Full name" value="Ada Park" required
    input "Street address" value="12 Elm Street" required
    input "City" value="Springfield" required
    input "Postcode" value="12A" error="Enter a valid postcode" required
    button "Place order" primary lg width=fill -> #confirmed

screen "Order confirmed" phone #confirmed
  column pad=lg gap=md align=center justify=center
    icon "check"
    h1 "Order confirmed"
    text "Thanks, Ada! A receipt is on its way to your email." muted
    button "Continue shopping" primary width=fill -> #cart
```

## 5. Desktop task board

```wirelith
wirelith 0.1
theme ink

screen "Plumbline board" desktop #board
  header
    h2 "Plumbline"
    spacer
    input placeholder="Search tasks" type=search width=260
    button "Filter" icon=filter #filter-btn
    button "New task" primary icon=plus #new-btn -> #new-task
  row gap=md pad=md align=start
    column grow gap=sm
      h3 "To do"
      card "Draft onboarding emails" #first-card
        row align=center
          badge "High" danger
          spacer
          avatar "Maya Chen"
        link "View details" -> #task-details
      card "Update pricing page copy"
        row align=center
          badge "Medium" primary
          spacer
          avatar "Jon Alvarez"
      card "Audit icon set"
        row align=center
          badge "Low" success
          spacer
          avatar "Maya Chen"
    column grow gap=sm
      h3 "In progress"
      card "Build billing export"
        row align=center
          badge "High" danger
          spacer
          avatar "Priya Nair"
      card "Fix login redirect bug"
        row align=center
          badge "Medium" primary
          spacer
          avatar "Jon Alvarez"
    column grow gap=sm
      h3 "Done"
      card "Set up analytics"
        row align=center
          badge "Medium" primary
          spacer
          avatar "Priya Nair"
      card "Write release notes"
        row align=center
          badge "Low" success
          spacer
          avatar "Maya Chen"
      card "Archive old projects"
        row align=center
          badge "Low" success
          spacer
          avatar "Jon Alvarez"
  modal "New task" #new-task
    input "Title" placeholder="What needs doing?" required
    textarea "Description" rows=3 placeholder="Add some detail"
    select "Assignee" [Maya Chen, Jon Alvarez, Priya Nair] value="Maya Chen"
    radio "Priority" [Low, Medium, High] value="Medium"
    row justify=end gap=sm
      button "Cancel" -> #board
      button "Create task" primary -> #board
  drawer "Task details" right #task-details
    h3 "Draft onboarding emails"
    row align=center gap=sm
      badge "High" danger
      text "In To do" muted
    row align=center gap=sm
      avatar "Maya Chen"
      text "Assigned to Maya Chen"
    text "Write a three-email welcome sequence for new trial users." lines=2
    divider
    h3 "Comments"
    text "Jon: Can we keep the first email under 100 words?" muted
    text "Priya: Draft copy is in the shared doc." muted
    textarea "Add a comment" rows=3 placeholder="Write a comment"
    row justify=end gap=sm
      button "Close" -> #board
      button "Comment" primary
  note "Opens a dialog to create a task" for=#new-btn
  note "Click View details to open the task panel" for=#first-card
```
