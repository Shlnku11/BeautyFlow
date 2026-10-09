# Payments override

Route: `/app/payments`. Use date, method, status, staff, customer, and query filters; show paid/refunded totals. Keep pending, paid, refund, and canceled states explicit. Refund amounts use integer minor-unit data and require a reason; never imply online acquiring exists.
