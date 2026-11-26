from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from campus.roster import import_students_from_csv_text


class Command(BaseCommand):
    help = "Bulk import or update Bowen Navigator student accounts from a CSV file."

    def add_arguments(self, parser):
        parser.add_argument(
            "csv_path",
            help="Path to CSV file with columns: matric_number,full_name,email,password",
        )

    def handle(self, *args, **options):
        path = Path(options["csv_path"])
        if not path.exists():
            raise CommandError(f"CSV file not found: {path}")

        csv_text = path.read_text(encoding="utf-8-sig")
        summary = import_students_from_csv_text(csv_text)
        self.stdout.write(
            self.style.SUCCESS(
                f"Roster import complete: created={summary['created']}, "
                f"updated={summary['updated']}, skipped={summary['skipped']}."
            )
        )
        for err in summary["errors"]:
            self.stderr.write(self.style.WARNING(err))
