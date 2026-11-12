Phone sign-up screen

```wirelith
wirelith 0.1

screen "Create account" phone #signup
  h1 "Create your account"
  input "Name"
  input "Email" type=email placeholder="you@example.com"
  input "Password" type=password
  checkbox "I accept the terms"
  button "Sign up" primary
```

Account settings, Profile tab

```wirelith
wirelith 0.1

screen "Account settings" desktop #settings
  header
    h2 "Account settings"
  tabs [Profile, Security, Notifications] active="Profile"
    avatar "Mei Tanaka" lg
    input "Name" value="Mei Tanaka"
    input "Email" type=email value="mei@example.com"
    textarea "Short bio" rows=3
    select "Time zone" [UTC, Europe/Lisbon, Asia/Tokyo] value="Asia/Tokyo"
    row justify=end
      button "Cancel"
      button "Save" primary
```

Email inbox

```wirelith
wirelith 0.1

screen "Inbox" desktop #inbox
  sidebar
    h3 "Postwren"
    list
      item "Inbox" icon=inbox badge="12" active
      item "Sent" icon=send
      item "Drafts" icon=file-text
      item "Archive" icon=archive
  header
    input placeholder="Search mail" type=search grow
    button "Compose" primary icon=pencil
  table [Sender, Subject, Date]
    row [Ada Park, Launch notes, Today] selected
    row [Luis Ortega, Invoice for March, Yesterday]
    row [Omar Haddad, "Lunch on Friday?", Mon]
  row justify=end
    button "Previous" disabled
    button "Next"
```

Checkout flow

```wirelith
wirelith 0.1

screen "Cart" phone #cart
  h1 "Your cart"
  list
    item "Canvas tote" badge="1"
  button "Continue to shipping" primary -> #shipping

screen "Shipping address" phone #shipping
  h1 "Shipping address"
  input "Street"
  input "City"
  input "Postcode"
  button "Place order" primary -> #confirmed
  button "Back to cart" -> #cart

screen "Shipping address" #shipping-error of=#shipping state="Invalid postcode"
  h1 "Shipping address"
  input "Street" value="12 Harbour Lane"
  input "City" value="Fernhill"
  input "Postcode" value="ZZ9" error="Enter a valid postcode"
  button "Place order" primary disabled

screen "Order confirmed" phone #confirmed
  empty "Your order is on its way"
    button "Back to the shop" -> #cart
```

Task board

```wirelith
wirelith 0.1
theme ink

screen "Larkboard: Board" desktop #board
  header
    h3 "Larkboard"
    input placeholder="Search tasks" type=search width=240
    spacer
    button "Filter" icon=filter
    button "New task" primary #new-button -> #new-task
  grid cols=3
    column
      h3 "To do"
      card "Draft launch email" #first-card -> #details
        badge "High" danger
        avatar "Ada Park" sm
      card "Book the venue"
        badge "Medium"
        avatar "Luis Ortega" sm
    column
      h3 "In progress"
      card "Pricing page copy"
        badge "High" danger
        avatar "Mei Tanaka" sm
      card "Onboarding checklist"
        badge "Low"
        avatar "Omar Haddad" sm
    column
      h3 "Done"
      card "Pick a launch date"
        badge "Medium"
        avatar "Ada Park" sm
  modal "New task" #new-task
    input "Title"
    textarea "Description"
    select "Assignee" [Ada Park, Luis Ortega, Mei Tanaka, Omar Haddad]
    radio "Priority" [Low, Medium, High] value="Medium"
    row justify=end
      button "Cancel"
      button "Create task" primary
  drawer "Draft launch email" #details
    text "Write the email that announces the launch to existing customers."
    label "Assignee"
    avatar "Ada Park"
    textarea "Comment" placeholder="Write a comment"
    button "Post comment" primary
  note "Opens the dialog for a new task" for=#new-button
  note "Clicking a card opens its details" for=#first-card
```
