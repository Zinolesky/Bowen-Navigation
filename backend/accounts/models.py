from django.contrib.auth.models import AbstractUser, UserManager as BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, matric_number, password=None, **extra_fields):
        if not matric_number:
            raise ValueError("The matriculation number must be set")
        matric_number = matric_number.upper().strip()
        user = self.model(matric_number=matric_number, username=matric_number, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, matric_number, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(matric_number, password, **extra_fields)

    def create_superuser(self, matric_number, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_staff_admin", True)
        return self._create_user(matric_number, password, **extra_fields)


class User(AbstractUser):
    matric_number = models.CharField(max_length=32, unique=True)
    full_name = models.CharField(max_length=150)
    is_staff_admin = models.BooleanField(default=False)

    USERNAME_FIELD = "matric_number"
    REQUIRED_FIELDS = ["full_name"]

    objects = UserManager()

    def save(self, *args, **kwargs):
        self.matric_number = self.matric_number.upper().strip()
        self.username = self.matric_number
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.full_name} ({self.matric_number})"
