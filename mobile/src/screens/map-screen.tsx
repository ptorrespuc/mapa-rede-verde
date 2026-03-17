import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, type LongPressEvent, type Region } from "react-native-maps";
import * as Location from "expo-location";
import Toast from "react-native-toast-message";

import { GroupAvatar } from "@/src/components/groups/group-avatar";
import { PointActionModal } from "@/src/components/points/point-action-modal";
import { PointFormModal } from "@/src/components/points/point-form-modal";
import { PointSummaryCard } from "@/src/components/points/point-summary-card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field, FieldInput, FieldLabel, FieldSwitch } from "@/src/components/ui/field";
import { LoadingView } from "@/src/components/ui/loading-view";
import { Screen } from "@/src/components/ui/screen";
import { createPoint, listPoints, reviewPoint } from "@/src/lib/api";
import { calculateDistanceMeters, formatDistance } from "@/src/lib/format";
import { geocodeAddress } from "@/src/lib/geocoding";
import { getPointDisplayColor, isPointPendingForReview } from "@/src/lib/point-display";
import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";
import type { CreatePointPayload, PointRecord } from "@/src/types/domain";

const DEFAULT_REGION: Region = {
  latitude: -22.9068,
  longitude: -43.1729,
  latitudeDelta: 0.008,
  longitudeDelta: 0.008,
};

function createFocusedRegion(latitude: number, longitude: number): Region {
  return {
    latitude,
    longitude,
    latitudeDelta: 0.004,
    longitudeDelta: 0.004,
  };
}

export function MapScreen() {
  const params = useLocalSearchParams<{ group?: string; grupo?: string }>();
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);
  const {
    classifications,
    isAuthenticated,
    isReady,
    speciesCatalog,
    userContext,
    visibleGroups,
  } = useAppContext();
  const initialGroupCode = params.grupo || params.group || null;
  const submissionGroups = userContext?.submission_groups ?? [];
  const approvableGroups = userContext?.approvable_groups ?? [];
  const [points, setPoints] = useState<PointRecord[]>([]);
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [isGroupSwitcherOpen, setIsGroupSwitcherOpen] = useState(!initialGroupCode);
  const [selectedPoint, setSelectedPoint] = useState<PointRecord | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draftValues, setDraftValues] = useState<Partial<CreatePointPayload>>({});

  useEffect(() => {
    let isMounted = true;

    async function locateUser() {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        if (isMounted) {
          setMapRegion(DEFAULT_REGION);
          setMapCenter({
            latitude: DEFAULT_REGION.latitude,
            longitude: DEFAULT_REGION.longitude,
          });
        }
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (!isMounted) {
        return;
      }

      const nextRegion = createFocusedRegion(
        currentLocation.coords.latitude,
        currentLocation.coords.longitude,
      );

      setMapRegion(nextRegion);
      setMapCenter({
        latitude: nextRegion.latitude,
        longitude: nextRegion.longitude,
      });
    }

    void locateUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!visibleGroups.length || !initialGroupCode) {
      return;
    }

    const initialGroup = visibleGroups.find((group) => group.code === initialGroupCode);

    if (initialGroup) {
      setGroupFilter(initialGroup.id);
      setIsGroupSwitcherOpen(false);
    }
  }, [initialGroupCode, visibleGroups]);

  const refreshPoints = useCallback(
    async (nextClassificationId = classificationFilter, nextGroupId = groupFilter) => {
      setIsLoading(true);

      try {
        const nextPoints = await listPoints({
          classificationId: nextClassificationId === "all" ? null : nextClassificationId,
          groupId: nextGroupId === "all" ? null : nextGroupId,
        });
        setPoints(nextPoints);
        setSelectedPoint((current) => nextPoints.find((point) => point.id === current?.id) ?? null);
      } catch (error) {
        Toast.show({
          type: "error",
          text1: "Falha ao carregar pontos",
          text2: error instanceof Error ? error.message : "Tente novamente.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [classificationFilter, groupFilter],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void refreshPoints();
  }, [isReady, refreshPoints]);

  const selectedGroup = visibleGroups.find((group) => group.id === groupFilter) ?? null;
  const currentGroupSummary = selectedGroup ?? (visibleGroups.length === 1 ? visibleGroups[0] : null);
  const showGroupPicker =
    visibleGroups.length > 1 && (groupFilter === "all" || isGroupSwitcherOpen);
  const canReviewInCurrentScope =
    groupFilter === "all"
      ? approvableGroups.length > 0
      : approvableGroups.some((group) => group.id === groupFilter);
  const filteredPoints = pendingOnly ? points.filter((point) => isPointPendingForReview(point)) : points;
  const sortedPoints = useMemo(
    () =>
      [...filteredPoints]
        .map((point) => ({
          point,
          distance:
            mapCenter == null
              ? null
              : calculateDistanceMeters(mapCenter, {
                  latitude: point.latitude,
                  longitude: point.longitude,
                }),
        }))
        .sort((a, b) => {
          if (a.distance != null && b.distance != null && a.distance !== b.distance) {
            return a.distance - b.distance;
          }

          if (a.distance != null && b.distance == null) {
            return -1;
          }

          if (a.distance == null && b.distance != null) {
            return 1;
          }

          return a.point.title.localeCompare(b.point.title, "pt-BR");
        }),
    [filteredPoints, mapCenter],
  );
  const defaultSubmissionGroupId =
    submissionGroups.find((group) => group.id === groupFilter)?.id ?? submissionGroups[0]?.id ?? "";

  function focusPoint(point: PointRecord) {
    const nextRegion = createFocusedRegion(point.latitude, point.longitude);
    setMapRegion(nextRegion);
    setMapCenter({ latitude: point.latitude, longitude: point.longitude });
    mapRef.current?.animateToRegion(nextRegion, 450);
    setSelectedPoint(point);
  }

  function openCreateModal(coordinates?: { latitude: number; longitude: number }) {
    if (!submissionGroups.length) {
      Toast.show({
        type: "error",
        text1: isAuthenticated ? "Sem permissao para criar pontos" : "Entre para criar pontos",
      });
      return;
    }

    setDraftValues({
      groupId: defaultSubmissionGroupId,
      classificationId: classifications[0]?.id ?? "",
      longitude: coordinates?.longitude,
      latitude: coordinates?.latitude,
      status: "active",
      isPublic: submissionGroups.find((group) => group.id === defaultSubmissionGroupId)?.is_public ?? false,
    });
    setIsCreateOpen(true);
  }

  async function handleCreatePoint(payload: CreatePointPayload) {
    const createdPoint = await createPoint(payload);
    setIsCreateOpen(false);
    await refreshPoints(
      classificationFilter !== "all" && classificationFilter !== createdPoint.classification_id
        ? "all"
        : classificationFilter,
      groupFilter !== "all" && groupFilter !== createdPoint.group_id ? createdPoint.group_id : groupFilter,
    );
    focusPoint(createdPoint);
    Toast.show({
      type: "success",
      text1: createdPoint.approval_status === "pending" ? "Ponto enviado para aprovacao" : "Ponto criado",
    });
  }

  async function handleReview(point: PointRecord, action: "approve" | "reject") {
    const updatedPoint = await reviewPoint(point.id, action);
    await refreshPoints();
    setSelectedPoint(action === "approve" && (!pendingOnly || isPointPendingForReview(updatedPoint)) ? updatedPoint : null);
    Toast.show({
      type: "success",
      text1:
        action === "approve"
          ? point.has_pending_update
            ? "Alteracao aprovada"
            : "Ponto aprovado"
          : "Ponto rejeitado",
    });
  }

  async function handleAddressSearch() {
    if (!addressQuery.trim()) {
      Toast.show({
        type: "error",
        text1: "Informe um endereco",
      });
      return;
    }

    setIsSearchingAddress(true);

    try {
      const result = await geocodeAddress(addressQuery.trim());
      const nextRegion = createFocusedRegion(result.latitude, result.longitude);
      setMapRegion(nextRegion);
      setMapCenter({ latitude: result.latitude, longitude: result.longitude });
      mapRef.current?.animateToRegion(nextRegion, 450);
      Toast.show({
        type: "success",
        text1: "Endereco localizado",
        text2: result.formattedAddress,
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Busca indisponivel",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsSearchingAddress(false);
    }
  }

  if (!isReady) {
    return <LoadingView label="Carregando mapa..." />;
  }

  return (
    <Screen>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Mapa</Text>
            <View style={styles.groupHeader}>
              {currentGroupSummary ? (
                <GroupAvatar logoUrl={currentGroupSummary.logo_url} name={currentGroupSummary.name} size={32} />
              ) : null}
              <View style={styles.groupHeaderCopy}>
                <Text style={styles.title}>
                  {currentGroupSummary?.name ?? "Todos os grupos visiveis"}
                </Text>
                <Text style={styles.subtitle}>
                  {currentGroupSummary
                    ? `Grupo ${currentGroupSummary.is_public ? "publico" : "privado"}`
                    : `${visibleGroups.length} grupos no filtro atual`}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Badge>{isLoading ? "Carregando..." : `${filteredPoints.length} pontos`}</Badge>
            {submissionGroups.length ? (
              <Button compact label="Novo ponto" onPress={() => openCreateModal()} variant="secondary" />
            ) : null}
          </View>
        </View>

        <View style={styles.filterStack}>
          <Field>
            <FieldLabel>Classificacao</FieldLabel>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={classificationFilter} onValueChange={setClassificationFilter}>
                <Picker.Item label="Todas as classificacoes" value="all" />
                {classifications.map((classification) => (
                  <Picker.Item key={classification.id} label={classification.name} value={classification.id} />
                ))}
              </Picker>
            </View>
          </Field>

          {showGroupPicker ? (
            <Field>
              <FieldLabel>Grupo</FieldLabel>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={groupFilter}
                  onValueChange={(value) => {
                    setGroupFilter(value);
                    setIsGroupSwitcherOpen(value === "all");
                  }}
                >
                  <Picker.Item label="Todos os grupos visiveis" value="all" />
                  {visibleGroups.map((group) => (
                    <Picker.Item
                      key={group.id}
                      label={`${group.name} (${group.is_public ? "publico" : "privado"})`}
                      value={group.id}
                    />
                  ))}
                </Picker>
              </View>
            </Field>
          ) : currentGroupSummary && visibleGroups.length > 1 ? (
            <View style={styles.activeGroupBox}>
              <Text style={styles.activeGroupLabel}>Grupo ativo</Text>
              <Text style={styles.activeGroupName}>{currentGroupSummary.name}</Text>
              <Pressable onPress={() => setIsGroupSwitcherOpen(true)}>
                <Text style={styles.inlineAction}>Trocar grupo</Text>
              </Pressable>
            </View>
          ) : null}

          <Field>
            <FieldLabel>Buscar endereco</FieldLabel>
            <View style={styles.addressRow}>
              <FieldInput
                onChangeText={setAddressQuery}
                placeholder="Rua, bairro, numero ou referencia"
                value={addressQuery}
              />
              <Button
                compact
                label={isSearchingAddress ? "..." : "Ir"}
                onPress={() => void handleAddressSearch()}
                variant="ghost"
              />
            </View>
          </Field>

          {canReviewInCurrentScope ? (
            <FieldSwitch
              label="Exibir somente pontos pendentes"
              onValueChange={setPendingOnly}
              value={pendingOnly}
            />
          ) : null}
        </View>
      </Card>

      <Card>
        <MapView
          onLongPress={(event: LongPressEvent) => {
            openCreateModal(event.nativeEvent.coordinate);
          }}
          onRegionChangeComplete={(region) => {
            setMapRegion(region);
            setMapCenter({ latitude: region.latitude, longitude: region.longitude });
          }}
          ref={mapRef}
          region={mapRegion}
          style={styles.map}
        >
          {filteredPoints.map((point) => (
            <Marker
              coordinate={{ latitude: point.latitude, longitude: point.longitude }}
              key={point.id}
              onPress={() => setSelectedPoint(point)}
              pinColor={getPointDisplayColor(point)}
              title={point.title}
            />
          ))}
        </MapView>
        <Text style={styles.mapHint}>Toque prolongado no mapa para abrir o cadastro na coordenada.</Text>
      </Card>

      {sortedPoints.length ? (
        sortedPoints.map(({ point, distance }) => (
          <PointSummaryCard
            key={point.id}
            meta={distance == null ? point.group_name : `${point.group_name} | ${formatDistance(distance)}`}
            onCenter={() => focusPoint(point)}
            onPress={() => setSelectedPoint(point)}
            point={point}
          />
        ))
      ) : (
        <EmptyState
          title="Nenhum ponto no filtro"
          description="Ajuste classificacao, grupo ou a exibicao de pendentes para encontrar registros."
        />
      )}

      <PointActionModal
        onApprove={(point) => void handleReview(point, "approve")}
        onClose={() => setSelectedPoint(null)}
        onEdit={(point) => router.push(`/points/${point.id}/edit`)}
        onOpenDetail={(point) => router.push(`/points/${point.id}`)}
        onReject={(point) => void handleReview(point, "reject")}
        open={Boolean(selectedPoint)}
        point={selectedPoint}
      />

      <PointFormModal
        classifications={classifications}
        groups={submissionGroups}
        initialValues={draftValues}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreatePoint}
        open={isCreateOpen}
        speciesCatalog={speciesCatalog}
        submitLabel="Criar ponto"
        title="Novo ponto"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    gap: spacing.md,
  },
  headerCopy: {
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  groupHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  groupHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  filterStack: {
    gap: spacing.md,
  },
  pickerWrapper: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  activeGroupBox: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: spacing.md,
  },
  activeGroupLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  activeGroupName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  inlineAction: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  addressRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  map: {
    borderRadius: 16,
    height: 360,
    overflow: "hidden",
  },
  mapHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
