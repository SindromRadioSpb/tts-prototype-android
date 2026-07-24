FROM ghcr.io/nesquena/hermes-webui@sha256:10eaa2d43efbdd01833e7ff64aaaa5557beb15e2a34d32a489af4fd4ed5fbff5

COPY patch_streaming.py /tmp/c1-patch-streaming.py
RUN python /tmp/c1-patch-streaming.py \
    && rm /tmp/c1-patch-streaming.py

LABEL org.linguistpro.component="c1-hermex-audio-attachment-bridge" \
      org.linguistpro.base-digest="sha256:10eaa2d43efbdd01833e7ff64aaaa5557beb15e2a34d32a489af4fd4ed5fbff5"
