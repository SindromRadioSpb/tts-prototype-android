FROM linguistpro/hermes-webui-c1:20260724-1

COPY --chown=root:root webui-extension/ /opt/c2-live-extension/
COPY --chown=root:root token-sidecar/ /opt/c2-live-sidecar/
RUN chmod 0555 /opt/c2-live-extension/start-c2-webui.sh \
    && chmod -R a-w /opt/c2-live-extension /opt/c2-live-sidecar

ENV HERMES_WEBUI_EXTENSION_DIR=/opt/c2-live-extension \
    HERMES_WEBUI_EXTENSION_MANIFEST=manifest.json \
    HERMES_WEBUI_CSP_CONNECT_EXTRA=wss://generativelanguage.googleapis.com

USER root
CMD ["/opt/c2-live-extension/start-c2-webui.sh"]
