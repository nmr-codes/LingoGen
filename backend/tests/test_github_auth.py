from config import get_settings
from models.user import GitHubAuthRequest


def test_github_settings_exist():
    settings = get_settings()
    assert hasattr(settings, "github_client_id")
    assert hasattr(settings, "github_client_secret")
    assert hasattr(settings, "github_redirect_uri")


def test_github_auth_request_model_exists():
    payload = GitHubAuthRequest(code="abc123")
    assert payload.code == "abc123"
