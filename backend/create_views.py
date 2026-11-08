from sqlalchemy import text
from app.db import engine

view1 = """
CREATE OR REPLACE VIEW instalment_status AS
SELECT i.id AS instalment_id, i.student_id, i.seq, i.due_date, i.amount_paise,
       COALESCE(SUM(a.amount_paise), 0)::bigint                     AS paid_paise,
       (i.amount_paise - COALESCE(SUM(a.amount_paise), 0))::bigint  AS balance_paise,
       CASE WHEN i.amount_paise > COALESCE(SUM(a.amount_paise), 0)
             AND i.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
            THEN (now() AT TIME ZONE 'Asia/Kolkata')::date - i.due_date
            ELSE 0 END                                              AS days_overdue
FROM instalments i
LEFT JOIN payment_allocations a ON a.instalment_id = i.id
GROUP BY i.id;
"""

view2 = """
CREATE OR REPLACE VIEW unmatched_payments AS
SELECT p.id AS payment_id, p.student_id, p.amount_paise, p.method, p.reference, p.received_at,
       (p.amount_paise - COALESCE(SUM(a.amount_paise), 0))::bigint AS unallocated_paise
FROM payments p
LEFT JOIN payment_allocations a ON a.payment_id = p.id
WHERE p.status = 'succeeded'
GROUP BY p.id
HAVING p.amount_paise > COALESCE(SUM(a.amount_paise), 0);
"""

with engine.begin() as conn:
    print("Creating instalment_status view...")
    conn.execute(text(view1))
    print("Creating unmatched_payments view...")
    conn.execute(text(view2))
    print("Views created successfully!")

