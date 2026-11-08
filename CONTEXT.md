# Receipt Scanner

A signed-in member scans receipts from purchases in Thailand to record their expenses. Finance Head can read expenses across the team. The app supports Thai and English receipts with totals in THB.

## Language

**Receipt photo**:
An image of a receipt supplied by the user for extraction. The saved expense contains the purchase details only.

**Duplicate upload**:
The same user submits the exact same receipt photo again while the expense saved from it still exists. Separate photos with matching purchase details are treated as separate submissions.

**Incomplete scan**:
A receipt scan with one or more missing or unusable purchase details. It becomes an expense once the user supplies the missing details and saves it.

**Expense**:
A saved record owned by one user, with a document type, date and total paid in THB. It has a shop name or payee name (or both). A detailed receipt also contains line items and receipt adjustments.

**Transfer slip**:
Evidence of a bank transfer. It can identify the recipient without identifying a shop, and may have no item breakdown. The user reviews extracted information before saving.

**Payee**:
The recipient of the payment or transfer. A payee's account name can differ from the shop name.

**Total paid**:
The final amount charged for the purchase, after any discounts and including any tax or fees charged.

**Expense list**:
A user's collection of saved expenses, readable by that user and Finance Head.

**Running total**:
The sum of the total paid across the user's saved expenses.

**Member**:
A signed-in user who has joined the application as a regular member. New sign-ins can join automatically; Finance Head access is assigned separately by a trusted administrator.

**Finance Head**:
A member with permission to read all retained team expenses and their summaries. Owners manage their own expenses.

**Department**:
A descriptive team label such as IT or BOARD. A user may belong to multiple departments, independently of Finance Head permissions.
For the test app, members choose their own departments; these selections are unverified labels, not proof of an official position.

**Line item**
A purchased item or group of identical items on a receipt, with a description and the full line amount after any item-level discount.

**Receipt adjustment**
A change to the receipt total excluded from the line amounts, such as a receipt-wide discount or an additional fee. Discounts are negative, while additional charges are positive.

**Reconciled receipt**
A receipt whose line amounts plus receipt adjustments equal the total paid exactly.
