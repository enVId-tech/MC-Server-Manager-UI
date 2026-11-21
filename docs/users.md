# Users and impersonation

## Accounts

Anyone can register. The first account on a fresh installation becomes an administrator, and so does any email in `ADMIN_EMAILS` when it signs up. Everyone else starts as a normal user.

Users manage their own email and password under **Account**. Logging in elsewhere or changing a password invalidates the previous session (one active session per account).

## Managing users

In **Admin → Users** you can:

- **promote** a user to administrator or **demote** an administrator,
- **activate** or **deactivate** an account (a deactivated account cannot sign in),
- set a **server quota** (the number of servers the user may create, three by default),
- **delete** a user.

## Impersonation

To see what a user sees, use **Impersonate** on a user. You can open the site:

- as an **ordinary user preview** (what a non-admin sees),
- as a particular account, as that user, or
- as that user **with admin rights**.

A banner shows the state at all times and ends it with one click. Use this to reproduce a problem a user reports without asking for their password.
