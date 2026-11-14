## 1. Phone sign-up

```wirelith
wirelith 0.1

screen "Sign up" phone #signup
  column gap=md pad=lg
    h1 "Create your account"
    text "It takes less than a minute." muted
    input "Full name" placeholder="Ada Park" required
    input "Email" type=email placeholder="you@example.com" required
    input "Password" type=password placeholder="At least 8 characters" required
    checkbox "I accept the Terms of Service and Privacy Policy"
    button "Create account" primary lg width=fill
    row justify=center
      link "Already have an account? Log in"
```

## 2. Desktop account settings (Profile tab)

```wirelith
wirelith 0.1

screen "Account settings" desktop #settings
  header
    h2 "Account settings"
  tabs [Profile, Security, Notifications] active="Profile"
    column gap=md pad=lg width=640
      row gap=md align=center
        avatar "Ada Park"
        button "Change photo" sm
      input "Name" value="Ada Park" required
      input "Email" type=email value="ada.park@example.com" required
      textarea "Bio" placeholder="A few words about you" rows=3
      select "Time zone" [UTC, Europe/London, Europe/Berlin, America/New_York, Asia/Tokyo] value="Europe/London"
      divider
      row justify=end gap=sm
        button "Cancel"
        button "Save" primary
```

## 3. Desktop email inbox

```wirelith
wirelith 0.1

screen "Inbox" desktop #inbox
  header
    h2 "Mail"
    spacer
    input placeholder="Search mail" type=search width=360
    button "Compose" primary icon=pencil
  row grow
    sidebar
      list
        item "Inbox" active icon=inbox badge="12"
        item "Starred" icon=star
        item "Sent" icon=send
        item "Drafts" icon=file-text badge="2"
        item "Spam" icon=shield
        item "Trash" icon=trash
    column grow gap=md pad=md
      table [Sender, Subject, Date]
        row [Luis Ortega, Website redesign kickoff, 9:42 AM]
        row [Mia Chen, Invoice for March, 8:15 AM]
        row [Ada Park, "Re: Launch plan, final draft", Yesterday]
        row [Team Calendar, Weekly sync moved to Thursday, Yesterday]
        row [Noah Diaz, Quick question about the API, Mar 3]
        row [Billing, Your receipt, Mar 2]
      row justify=between align=center
        label "1–50 of 248"
        row gap=sm
          button "Previous" disabled
          button "Next"
```

## 4. Phone checkout flow (with invalid postcode state)

```wirelith
wirelith 0.1

screen "Cart" phone #cart
  header
    h2 "Cart"
  column gap=md pad=md
    row gap=sm align=center
      image "Tote bag photo" width=64 height=64
      column grow
        text "Canvas tote bag"
        label "Qty 1"
      text "$24.00"
    divider
    row gap=sm align=center
      image "Mug photo" width=64 height=64
      column grow
        text "Ceramic mug"
        label "Qty 2"
      text "$32.00"
    divider
    row justify=between
      text "Subtotal"
      text "$56.00"
    row justify=between
      text "Shipping" muted
      text "Calculated next" muted
    button "Continue to shipping" primary lg width=fill -> #shipping

screen "Shipping address" phone #shipping
  header
    button icon=arrow-left sm -> #cart
    h2 "Shipping address"
  column gap=md pad=md
    input "Full name" placeholder="Ada Park" required
    input "Address line 1" placeholder="12 High Street" required
    input "Address line 2" placeholder="Flat, suite (optional)"
    input "City" placeholder="London" required
    input "Postcode" placeholder="SW1A 1AA" required
    select "Country" [United Kingdom, Ireland, France, Germany] value="United Kingdom"
    button "Place order · $60.50" primary lg width=fill -> #confirmed
    button "Back to cart" width=fill -> #cart

screen "Shipping address" phone #shipping-error of=#shipping state="Invalid postcode"
  header
    button icon=arrow-left sm -> #cart
    h2 "Shipping address"
  column gap=md pad=md
    error "Please fix the highlighted field."
    input "Full name" value="Ada Park" required
    input "Address line 1" value="12 High Street" required
    input "Address line 2" placeholder="Flat, suite (optional)"
    input "City" value="London" required
    input "Postcode" value="ZZ9 99" required error="Enter a valid UK postcode"
    select "Country" [United Kingdom, Ireland, France, Germany] value="United Kingdom"
    button "Place order · $60.50" primary lg width=fill disabled
    button "Back to cart" width=fill -> #cart

screen "Order confirmed" phone #confirmed
  column gap=md pad=lg align=center
    icon "check"
    h1 "Order confirmed"
    text "Thanks, Ada! Your order #10482 is on its way." muted
    card "Delivery"
      text "12 High Street, London SW1A 1AA"
      label "Arrives Thu 14 March"
    button "Continue shopping" primary width=fill -> #cart
```

## 5. Desktop task board for Tasklane (ink theme)

```wirelith
wirelith 0.1
theme ink

screen "Board" desktop #board
  header
    h2 "Tasklane"
    spacer
    input placeholder="Search tasks" type=search width=280
    button "Filter" icon=filter #filter
    button "New task" primary icon=plus #new-btn -> #new-task
  grid cols=3 gap=md pad=md
    column gap=sm
      h3 "To do"
      card "Design login page" #first-card
        row justify=between align=center
          badge "High" danger
          avatar "Ada Park"
        link "Open details" -> #task-drawer
      card "Write onboarding emails"
        row justify=between align=center
          badge "Medium" primary
          avatar "Luis Ortega"
      card "Audit color contrast"
        row justify=between align=center
          badge "Low"
          avatar "Mia Chen"
    column gap=sm
      h3 "In progress"
      card "Billing page API"
        row justify=between align=center
          badge "High" danger
          avatar "Noah Diaz"
      card "Mobile nav prototype"
        row justify=between align=center
          badge "Medium" primary
          avatar "Ada Park"
    column gap=sm
      h3 "Done"
      card "Set up analytics"
        row justify=between align=center
          badge "Low"
          avatar "Luis Ortega"
      card "Pricing page copy"
        row justify=between align=center
          badge "Medium" primary
          avatar "Mia Chen"
      card "Fix signup crash"
        row justify=between align=center
          badge "High" danger
          avatar "Noah Diaz"
  modal "New task" #new-task
    input "Title" placeholder="What needs doing?" required
    textarea "Description" placeholder="Add details" rows=4
    select "Assignee" [Unassigned, Ada Park, Luis Ortega, Mia Chen, Noah Diaz] value="Unassigned"
    radio "Priority" [Low, Medium, High] value="Medium"
    row justify=end gap=sm
      button "Cancel" -> #board
      button "Create task" primary -> #board
  drawer "Design login page" right #task-drawer
    row gap=sm align=center
      badge "High" danger
      label "To do"
    row gap=sm align=center
      avatar "Ada Park"
      text "Ada Park"
    label "Due 14 March"
    text "Create the login screen with email, password and SSO options." lines=3
    divider
    h3 "Comments"
    list
      item "Luis Ortega: Wireframes are in the shared folder."
      item "Mia Chen: Remember the error states."
    textarea placeholder="Write a comment" rows=3
    row justify=end
      button "Comment" primary
  note "Clicking a card opens the task details drawer on the right" for=#first-card
  note "Filter by assignee, priority and due date" for=#filter
```
