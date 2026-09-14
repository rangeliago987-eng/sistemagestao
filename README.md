# Stylo Fibra — Sistema de Vendas

Sistema interno de vendas/CRM da Stylo Fibra (móveis em fibra sintética e corda náutica).

## Status atual

Este repositório contém o código exportado do sistema construído como Artifact do Claude
(`index.html`). Nessa versão, o salvamento de dados (leads, orçamentos, produtos, fotos)
ainda depende de recursos que só existem dentro do ambiente Claude
(`window.claude.use("db" | "assets" | "downloads")`) — ao abrir este arquivo fora do Claude,
o sistema funciona visualmente mas **não salva nada** (fica em modo local, reiniciando a
cada visita).

## Próximos passos (em andamento)

- [ ] Trocar a camada de dados por Firebase (Firestore + Storage) para salvamento real
- [ ] Adicionar login (Firebase Auth) para proteger os dados
- [ ] Publicar com hospedagem gratuita (GitHub Pages ou Firebase Hosting)
- [ ] Migrar os dados já cadastrados no sistema atual

## Sobre

Construído junto com o Claude, sessão por sessão, a partir de 13/09/2026.
