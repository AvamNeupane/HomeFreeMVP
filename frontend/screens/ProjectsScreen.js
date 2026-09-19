/**
 * Projects Screen — lists every project the logged-in user has started,
 * most recently updated first. Lives behind the "Projects" tab (see
 * App.js's tab bar — the only two tabs are Home and Projects, per
 * explicit design direction to keep navigation minimal).
 *
 * Tapping a project hands off to App.js's onOpenProject, which either
 * resumes an in-progress project into the normal flow or jumps straight
 * to that project's Final Report if one was already generated.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import Colors from '../constants/Colors';
import Fonts from '../constants/Fonts';
import { apiFetch } from '../api';
import Icon from '../components/Icon';
import Button from '../components/Button';

function timeAgo(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

export default function ProjectsScreen({ apiBaseUrl, onOpenProject, onStartNewProject }) {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadProjects = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true); else setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}/projects`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load projects');
      }
      setProjects(data.projects || []);
    } catch (err) {
      console.error('❌ Load projects error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const projectLabel = (project) => {
    if (project.project_name) return project.project_name;
    if (project.rooms && project.rooms.length > 0) {
      return project.rooms.map((r) => (r || '').replace(/_/g, ' ')).join(' + ');
    }
    return 'Untitled Project';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadProjects(true)} tintColor={Colors.primary} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Your Projects</Text>
          <Text style={styles.subtitle}>Pick up where you left off, or revisit a finished plan.</Text>
        </View>

        {onStartNewProject && (
          <Button
            title="+ Start a New Project"
            onPress={onStartNewProject}
            variant="outline"
            style={styles.newProjectButton}
          />
        )}

        {isLoading && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}

        {!isLoading && error && (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>Couldn't load your projects: {error}</Text>
            <TouchableOpacity onPress={() => loadProjects()} style={styles.retryLink}>
              <Text style={styles.retryLinkText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && !error && projects.length === 0 && (
          <View style={styles.centerBox}>
            <Icon name="folder" size={56} color={Colors.icon} style={styles.emptyEmoji} />
            <Text style={styles.emptyText}>No projects yet — start organizing a room from the Home tab.</Text>
          </View>
        )}

        {!isLoading && projects.map((project) => (
          <TouchableOpacity
            key={project.id}
            style={styles.projectCard}
            onPress={() => onOpenProject(project)}
            activeOpacity={0.75}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.projectName} numberOfLines={1}>{projectLabel(project)}</Text>
              <Text style={styles.projectMeta}>Updated {timeAgo(project.updated_at)}</Text>
            </View>
            <View style={[styles.statusBadge, project.has_report ? styles.statusBadgeDone : styles.statusBadgeProgress]}>
              <Text style={[styles.statusBadgeText, project.has_report ? styles.statusBadgeTextDone : styles.statusBadgeTextProgress]}>
                {project.has_report ? 'Report Ready' : 'In Progress'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scrollContent: { padding: 24, paddingBottom: 60 },
  header: { marginBottom: 24 },
  newProjectButton: { marginBottom: 24 },
  title: { fontSize: 26, fontFamily: Fonts.headingBold, color: Colors.accent, marginBottom: 6 },
  subtitle: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
  centerBox: { alignItems: 'center', paddingVertical: 60 },
  errorText: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: '#C0392B', textAlign: 'center', marginBottom: 12 },
  retryLink: { paddingVertical: 8, paddingHorizontal: 16 },
  retryLinkText: { fontSize: 14, fontFamily: Fonts.bodySemiBold, color: Colors.primary },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 20, lineHeight: 20 },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  projectName: { fontSize: 16, fontFamily: Fonts.bodySemiBold, color: Colors.accent, marginBottom: 4, textTransform: 'capitalize' },
  projectMeta: { fontSize: 12, fontFamily: Fonts.bodyRegular, color: Colors.textSecondary },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 10 },
  statusBadgeDone: { backgroundColor: '#E4F1EA' },
  statusBadgeProgress: { backgroundColor: Colors.secondary },
  statusBadgeText: { fontSize: 11, fontFamily: Fonts.bodySemiBold },
  statusBadgeTextDone: { color: '#2E7D5B' },
  statusBadgeTextProgress: { color: Colors.accent },
});
