# Life CFO — Money Reasoning Layer

Last updated: March 2026

This document defines the financial reasoning layer used by Life CFO.

The reasoning layer sits between raw financial data and the Ask system.

Its purpose is to convert raw financial data into meaningful financial structure that can support financial analysis and decision reasoning.

---

# Three Layer Financial Architecture

Life CFO operates using three financial layers.

Layer 1 — Financial Truth  
Layer 2 — Financial Structure  
Layer 3 — Financial Reasoning  

---

# Layer 1 — Financial Truth

This layer contains raw financial data imported from financial providers.

Sources include:

accounts  
transactions  
external_connections  
external_accounts  
money_goals  

This layer answers the question:

What happened?

Examples:

salary deposit  
grocery purchase  
electricity bill  
subscription charge  

Raw transactions describe events but do not describe financial meaning.

---

# Layer 2 — Financial Structure

The financial structure layer converts raw transactions into financial meaning.

This layer organises household finances into a stable financial model.

Life CFO uses four financial flows:

IN  
OUT  
SAVED  
PLANNED  

These flows represent how money moves through a household financial system.

---

## IN

Money entering the household.

Examples:

salary  
business income  
government benefits  
investment income  

---

## OUT

Money leaving the household.

Examples:

groceries  
subscriptions  
shopping  
utilities  

---

## SAVED

Money intentionally retained or accumulated.

Examples:

savings accounts  
investments  
offset balances  
long-term reserves  

---

## PLANNED

Future financial commitments and planned spending.

Examples:

rent  
mortgage  
loan repayments  
insurance  
school fees  
planned purchases  

---

# Commitments

Within the OUT and PLANNED flows, Life CFO distinguishes **commitments**.

Commitments represent financial obligations.

Examples:

rent  
mortgage  
loan payments  
insurance premiums  
subscriptions  

Commitments are important because they create **structural financial pressure**.

---

# Discretionary Spending

Discretionary spending represents flexible spending that can change without breaking financial obligations.

Examples:

restaurants  
entertainment  
shopping  
travel  

This distinction allows the system to reason about **financial flexibility**.

---

# Financial Signals

Once structure is established, the system can derive financial signals.

Examples include:

financial pressure  
surplus capacity  
spending spikes  
income instability  
timing mismatches  

These signals allow the system to answer questions like:

Why does money feel tight?

---

# Financial Rhythm

Households operate with financial timing patterns.

Examples:

monthly salary  
weekly groceries  
quarterly insurance  
annual bills  

Understanding rhythm allows the system to reason about timing-based pressure.

---

# Relationship to Ask

The Ask system does not reason directly over raw transactions.

Instead it reasons over:

financial structure  
financial signals  
household balances  
known commitments  

This separation ensures:

clean architecture  
faster reasoning  
more accurate analysis  

---

# Example Flow

transactions imported from provider  
↓  
transactions classified into financial flows  
↓  
commitments and discretionary spending identified  
↓  
financial signals calculated  
↓  
Ask reasoning engine evaluates the question  

---

# Design Principles

The money reasoning layer should be:

explainable  
deterministic where possible  
household-scoped  
provider-agnostic  

This layer converts financial data into **financial understanding**.

---

# Long Term Evolution

Future capabilities may include:

automated commitment detection  
income stability scoring  
financial pressure indicators  
scenario modelling inputs  

This layer is the foundation for advanced financial reasoning in Life CFO.