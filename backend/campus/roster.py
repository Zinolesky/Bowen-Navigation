import csv
import io
import re

from django.contrib.auth import get_user_model

User = get_user_model()
_MATRIC_RE = re.compile(r"^[A-Z0-9/_-]{4,32}$")


def import_students_from_csv_text(csv_text: str) -> dict:
    """
    Imports or updates student accounts from CSV text.
    Supports optional header row (`matric_number,full_name,email,password`)
    or positional columns `matric_number, full_name[, email[, password]]`.
    Existing staff/admin accounts are preserved and never modified or demoted.
    """
    created = 0
    updated = 0
    skipped = 0
    errors: list[str] = []

    reader = csv.reader(io.StringIO(csv_text.strip()))
    rows = [row for row in reader if any(cell.strip() for cell in row)]
    if not rows:
        return {"created": 0, "updated": 0, "skipped": 0, "errors": ["CSV input is empty."]}

    first_row_lower = [c.strip().lower().replace(" ", "_") for c in rows[0]]
    has_header = "matric_number" in first_row_lower or "full_name" in first_row_lower

    col_map = {"matric_number": 0, "full_name": 1, "email": 2, "password": 3}
    start_idx = 0
    if has_header:
        start_idx = 1
        col_map = {}
        for idx, header in enumerate(first_row_lower):
            if header in ("matric_number", "matric", "matric_no"):
                col_map["matric_number"] = idx
            elif header in ("full_name", "name"):
                col_map["full_name"] = idx
            elif header == "email":
                col_map["email"] = idx
            elif header == "password":
                col_map["password"] = idx

    if "matric_number" not in col_map or "full_name" not in col_map:
        return {
            "created": 0,
            "updated": 0,
            "skipped": 0,
            "errors": ["Header must include 'matric_number' and 'full_name' columns."],
        }

    for line_num, row in enumerate(rows[start_idx:], start=start_idx + 1):
        matric_idx = col_map["matric_number"]
        name_idx = col_map["full_name"]
        email_idx = col_map.get("email")
        pw_idx = col_map.get("password")

        raw_matric = row[matric_idx] if matric_idx < len(row) else ""
        raw_name = row[name_idx] if name_idx < len(row) else ""
        raw_email = row[email_idx] if (email_idx is not None and email_idx < len(row)) else ""
        raw_pw = row[pw_idx] if (pw_idx is not None and pw_idx < len(row)) else ""

        matric = raw_matric.upper().strip()
        full_name = " ".join(raw_name.split())
        email = raw_email.strip().lower()
        password = raw_pw.strip()

        if not matric or not _MATRIC_RE.fullmatch(matric):
            errors.append(f"Row {line_num}: invalid matric_number '{raw_matric}'.")
            skipped += 1
            continue
        if len(full_name) < 2:
            errors.append(f"Row {line_num} ({matric}): full_name is required.")
            skipped += 1
            continue

        existing = User.objects.filter(matric_number__iexact=matric).first()
        if existing is not None:
            if existing.is_staff_admin or existing.is_staff or existing.is_superuser:
                skipped += 1
                errors.append(f"Row {line_num} ({matric}): skipped protected staff/admin account.")
                continue
            existing.full_name = full_name
            if email:
                existing.email = email
            if password:
                existing.set_password(password)
            existing.is_active = True
            existing.save()
            updated += 1
        else:
            User.objects.create_user(
                matric_number=matric,
                full_name=full_name,
                email=email,
                password=password or matric,
                is_staff_admin=False,
                is_active=True,
            )
            created += 1

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:50],
    }
