{{/* The app's public hostname as an https origin, empty when the install has not set one. */}}
{{- define "vf-workshops.origin" -}}
{{- if .Values.host }}https://{{ .Values.host }}{{ end }}
{{- end -}}
