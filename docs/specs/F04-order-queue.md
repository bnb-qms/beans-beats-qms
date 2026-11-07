<!-- Copied from the team's Feature Specs Google Doc, tab "F4: Order queue - Poojana", on 6 Nov 2026. -->

# **F4: Order Queue**

**Module:** 2. Barista Queue
**User Roles:** Barista
**User Stories:** 1, 2
**Author:** poojana326

## **1. Overview**

The Order Queue feature allows baristas to view all pending customer orders in sequence.

Each order displays the order number, customer name, drink, milk option and temperature. This helps baristas identify orders and prepare drinks in the correct order.

Orders are displayed based on their creation time, with the oldest order appearing first. Collected orders are removed from the active queue.

## **2\. Functional Requirements**

| ID   | Requirement                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------ |
| FR1  | Only authenticated baristas and authorized staff can access the order queue.                           |
| FR2  | The system displays all pending orders in the queue.                                                   |
| FR3  | Orders are displayed in sequence, with the oldest pending order first.                                 |
| FR4  | Each order displays its unique order number.                                                           |
| FR5  | Each order displays the customer's name.                                                               |
| FR6  | Each order displays the drink name and quantity.                                                       |
| FR7  | Each order displays the selected milk option and temperature.                                          |
| FR8  | The system displays the current status of each order.                                                  |
| FR9  | Orders marked as Collected are removed from the active queue.                                          |
| FR10 | The queue remains available for viewing when offline if order data has been previously loaded.         |
| FR11 | New customer orders to appear automatically in the barista queue without manually refreshing the page. |

## **3\. User Flow Diagram**

```
flowchart TD
    A([Barista logs in]) --> B[Open Order Queue]
    B --> C[Retrieve pending orders]
    C --> D[Sort orders by creation time]
    D --> E[Display order details]
    E --> F[Barista views and prepares orders]
    F --> G{Order collected?}
    G -->|No| E
    G -->|Yes| H[Remove from active queue]
    H --> I([Continue with next order])
```

## **4\. Acceptance Criteria**

- Authorized baristas can access the order queue after logging in.

- All pending orders are displayed in the queue.

- Orders appear in the correct sequence, oldest first.

- Each order displays its order number and customer name.

- Each order displays the correct drink name and quantity.

- Each order displays the selected milk option and temperature.

- Each order displays its current status.

- Orders marked as Collected no longer appear in the active queue.

- Previously loaded orders remain visible when the application goes offline.
