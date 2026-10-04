# Daikin Airbase pour Gladys

Pilote une climatisation gainable Daikin équipée d'un adaptateur Wi-Fi Airbase
(BRP15B61), directement sur votre réseau local — sans compte Daikin ni cloud.

## Fonctionnalités

- **Marche/arrêt**, **Mode** (auto, froid, chaud, déshumidification, ventilation),
  **Température de consigne** et **Vitesse de ventilation** (auto, basse, moyenne, haute).
- **Température intérieure**, et **température extérieure** si l'unité la fournit.
- **Un interrupteur par zone**, nommé comme dans l'application Daikin Airbase.

## Configuration

1. Sur votre box, donnez une IP fixe à l'adaptateur (réservation DHCP).
2. Saisissez cette IP dans l'onglet Configuration (plusieurs adaptateurs : séparées par des virgules).
3. Ouvrez l'onglet Découverte et créez l'appareil.

## Dépannage

- *Aucun adaptateur Airbase n'a répondu* — vérifiez l'IP, et que
  `http://<ip>/skyfi/common/basic_info` s'ouvre dans un navigateur sur le même réseau.
- Les changements faits depuis la commande murale apparaissent après l'intervalle de rafraîchissement (30 s par défaut).
- Journaux : `docker logs` sur le conteneur de l'intégration.
