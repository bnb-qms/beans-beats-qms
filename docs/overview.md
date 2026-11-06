# Project Overview

## Beans&Beats x Christmas Together 2026 Queue Management System

### Background

Beans&Beats is operating a charity coffee booth at Christmas Together 2026, held from **26–29 November 2026** at Hall F, Marina Bay Sands, Singapore. The event is expected to attract over 40,000 visitors, with all profits from the booth going to Singapore Red Cross Young Hearts.

### Project Objective

Develop a web-based order and queue management system that enables booth staff to efficiently manage drink orders and allows customers to track their order status in real time.

The system should streamline order processing, reduce confusion during drink collection, and remain operational despite unreliable internet connectivity.

### Target Users

- **Counter Staff:** Enter customer orders and view order totals.
- **Baristas:** Manage the preparation queue and update order statuses.
- **Customers:** Track their orders and receive ready notifications.
- **Admin:** Manage menu availability, pricing, and daily sales reports.

### Core Modules

1. **Order Screen:** Staff enter drink orders, customisations, quantities, and customer names. The system calculates the total and generates an order number.
2. **Barista Queue:** Displays orders in sequence and allows staff to update preparation statuses.
3. **Guest Status Page:** Customers scan a QR code to track their orders and receive ready alerts.
4. **Ready Board:** Public display showing orders ready for collection.
5. **Menu Controls:** Admins manage menu items, prices, and availability.
6. **Daily Sales Report:** Admins view daily sales totals and export reports as CSV files.

---

# Technical Requirements

## 1. Platform

- The system must be accessible through web browsers on tablets, mobile phones, and display screens.
- No application installation is required.
- The system must support separate staff and booth-lead access.

## 2. Offline Support

- The system must remain usable during temporary internet disruptions.
- Offline changes must be stored locally and synchronised when connectivity returns.
- The system must handle synchronisation conflicts without losing order information.

## 3. Real-Time Updates

- New orders must appear in the barista queue without manual refreshing.
- Order status changes must be reflected on the guest status page and ready board.
- Customers must receive an alert when their drinks are ready.

## 4. Order and Payment Management

- Staff enter orders directly into the system.
- Each order must have a unique order number.
- The system must calculate order totals, including customisation charges.
- Payments are processed separately through the organiser's POS.
- No payment processing or POS integration is required.

## 5. Data and Privacy

- Collect only the customer's first name, with an optional mobile number.
- Personal data must be handled in accordance with Singapore's PDPA.
- Historical orders must retain their original prices even when menu prices change.

## 6. Reporting

- The system must track daily drink quantities and sales totals.
- Daily sales reports must be exportable as CSV files for comparison with the organiser's POS.
- The system must support resetting orders and order numbering between event days.

## 7. Deployment and Deliverables

The project must provide:

1. A deployed web application containing all six modules, including test logins for barista and booth-lead views.
2. A GitHub repository with a README explaining setup, deployment, and daily reset procedures.
3. A 3-minute demonstration video showing the complete order workflow, including offline operation and recovery.
4. A one-page technical summary PDF covering the technology stack, architecture, offline synchronisation, PDPA compliance, and known limitations.

## 8. Project Timeline

| Milestone                           | Date                |
| ----------------------------------- | ------------------- |
| Development                         | 14 Oct – 8 Nov 2026 |
| Submission deadline                 | 8 Nov 2026          |
| Pitch day                           | 8 Nov 2026          |
| Production hardening (winning team) | 9–13 Nov 2026       |
| Barista dry run                     | Week of 16 Nov 2026 |
| Live operation                      | 26–29 Nov 2026      |
