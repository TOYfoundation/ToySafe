"""Alle mitgelieferten Plugins und die Standard-Registry."""
from __future__ import annotations

from toysafe.core.registry import PluginRegistry
from toysafe.plugins.code_audit import ContainerScanPlugin, DependencyAuditPlugin, SecretsScanPlugin
from toysafe.plugins.email_dns import EmailDNSPlugin
from toysafe.plugins.http_headers import HTTPHeadersPlugin
from toysafe.plugins.lynis_audit import LynisAuditPlugin
from toysafe.plugins.network_inventory import NetworkInventoryPlugin
from toysafe.plugins.nuclei_scan import NucleiScanPlugin
from toysafe.plugins.openvas_scan import OpenVASScanPlugin
from toysafe.plugins.recon_nmap import NmapDiscoveryPlugin
from toysafe.plugins.tls_audit import TLSAuditPlugin
from toysafe.plugins.toynode_audit import TimeSyncPlugin, ToyNodeAuditPlugin
from toysafe.plugins.unwanted_software import UnwantedSoftwarePlugin
from toysafe.plugins.wifi_guard import WifiGuardPlugin


def build_default_registry() -> PluginRegistry:
    registry = PluginRegistry()
    for plugin in (
        # 1 Erkundung
        NetworkInventoryPlugin(), NmapDiscoveryPlugin(), WifiGuardPlugin(),
        # 2 Außenhülle
        HTTPHeadersPlugin(), TLSAuditPlugin(), EmailDNSPlugin(),
        # 3 Schwachstellen
        OpenVASScanPlugin(), NucleiScanPlugin(), DependencyAuditPlugin(), ContainerScanPlugin(),
        # 4 Härtung
        LynisAuditPlugin(), SecretsScanPlugin(), TimeSyncPlugin(),
        # 5 Tiefenprüfung
        UnwantedSoftwarePlugin(), ToyNodeAuditPlugin(),
    ):
        registry.register(plugin)
    return registry


def prepare_registry(registry: PluginRegistry, assets) -> PluginRegistry:
    """Gibt dem Radar die bekannte Asset-Liste für den Inventar-Abgleich."""
    for plugin in registry.plugins:
        if isinstance(plugin, NetworkInventoryPlugin):
            plugin.set_known_assets(assets)
    return registry
