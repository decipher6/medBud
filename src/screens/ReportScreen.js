import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, ScrollView, TouchableOpacity } from 'react-native';
import { 
  Button, Card, Title, Paragraph, Divider, Text,
  ActivityIndicator, Snackbar, Surface, Chip, IconButton
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DatePickerModal } from 'react-native-paper-dates';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../services/api';
import { theme } from '../theme/theme';
import { useAuth } from '../services/authService';

// Use require for the logo
const logoImage = require('../../assets/logo.png');

// Temporary user ID - In a real app, this would come from authentication
const USER_ID = '67ebd559c9003543caba959c';

// Constants for PDF styling
const THEME_COLOR = theme.colors.primary;
const ACCENT_COLOR = theme.colors.secondary;
const LIGHT_GRAY = theme.colors.surface;
const DARK_GRAY = theme.colors.disabled;
const PAGE_MARGIN = 20;
const CONTENT_WIDTH = 170;

// Define fonts
const fonts = {
  Roboto: {
    normal: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf',
    bold: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf',
    italics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Italic.ttf',
    bolditalics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-MediumItalic.ttf'
  }
};

function ReportScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [error, setError] = useState(null);
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [reports, setReports] = useState([]);

  // Setup network state listeners
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const isConnected = state.isConnected && state.isInternetReachable;
      setIsOnline(isConnected);
    });

    // Initial network check
    NetInfo.fetch().then(state => {
      setIsOnline(state.isConnected && state.isInternetReachable);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Load and convert logo on component mount
  useEffect(() => {
    const loadLogo = async () => {
      try {
        // Fetch the logo as a blob
        const response = await fetch(logoImage);
        const blob = await response.blob();
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          setLogoDataUrl(reader.result);
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.warn('Error pre-loading logo:', err);
      }
    };

    loadLogo();
  }, []);

  const formatReportContent = (rawContent) => {
    try {
      const reportData = JSON.parse(rawContent);
      const reportContent = reportData.generated_report;
      const sections = reportContent.split('###').filter(Boolean);
      
      return sections.map((section, index) => {
        const cleanSection = section
          .replace(/\\n/g, '\n')
          .replace(/\*\*/g, '')
          .trim();
        
        return {
          id: index,
          content: cleanSection
        };
      });
    } catch (error) {
      console.error('Error parsing report:', error);
      return [{ id: 0, content: rawContent }];
    }
  };

  const generateReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Check network connection
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected || !netInfo.isInternetReachable) {
        setError('No Internet connection. Please check your network and try again.');
        return;
      }
      
      if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
        setError('End date cannot be earlier than start date.');
        return;
      }

      const reportData = await api.generateReport(USER_ID, startDate, endDate, 'summary');
  
      setReport({
        content: formatReportContent(reportData),
        generatedAt: new Date()
      });
    } catch (error) {
      console.error('Error generating report:', error);
  
      if (error.status === 404) {
        setError('No health data found for the selected date range. Please try a different date range.');
      } else if (error.status === 500) {
        setError('The AI Report Generator encountered a problem. Please try again later.');
      } else {
        setError('Unexpected error. Please check your connection and try again.');
      }
  
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  };

  const exportToPdf = async () => {
    try {
      setIsPdfExporting(true);
      setError(null);

      // Check network connection
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected || !netInfo.isInternetReachable) {
        setError('No Internet connection. Please check your network and try again.');
        return;
      }

      // Import pdfmake dynamically
      const pdfMake = (await import('pdfmake/build/pdfmake')).default;

      // Process sections
      const sections = report.content.map(section => {
        const lines = section.content.split('\n');
        const title = lines[0].trim();
        // Process content to create proper paragraphs and lists
        const contentLines = lines.slice(1);
        const processedContent = [];
        let currentParagraph = [];

        contentLines.forEach(line => {
          line = line.trim();
          if (!line) {
            if (currentParagraph.length > 0) {
              processedContent.push(currentParagraph.join(' '));
              currentParagraph = [];
            }
          } else if (line.startsWith('*')) {
            if (currentParagraph.length > 0) {
              processedContent.push(currentParagraph.join(' '));
              currentParagraph = [];
            }
            processedContent.push(line);
          } else {
            currentParagraph.push(line);
          }
        });

        if (currentParagraph.length > 0) {
          processedContent.push(currentParagraph.join(' '));
        }

        return { title, content: processedContent };
      });

      // Define document definition
      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        
        header: {
          stack: [
            {
              canvas: [
                {
                  type: 'rect',
                  x: 0,
                  y: 0,
                  w: 595.28,
                  h: 60,
                  color: THEME_COLOR,
                }
              ]
            },
            {
              text: 'HEALTH REPORT',
              fontSize: 28,
              bold: true,
              color: 'white',
              margin: [40, -45, 40, 20]
            }
          ]
        },

        footer: function(currentPage, pageCount) {
          return {
            stack: [
              {
                canvas: [
                  {
                    type: 'line',
                    x1: 40,
                    y1: -30,
                    x2: 555.28,
                    y2: -30,
                    lineWidth: 1,
                    lineColor: THEME_COLOR
                  }
                ]
              },
              {
                text: `Page ${currentPage} of ${pageCount}`,
                alignment: 'center',
                fontSize: 9,
                color: DARK_GRAY,
                margin: [0, -20, 0, 0]
              }
            ]
          };
        },

        content: [
          // Report info
          {
            stack: [
              {
                columns: [
                  {
                    text: `Generated: ${report.generatedAt.toLocaleDateString()}`,
                    fontSize: 11,
                    color: DARK_GRAY,
                    width: 'auto'
                  },
                  startDate || endDate ? {
                    text: `Report Period: ${startDate || 'All'} to ${endDate || 'Present'}`,
                    fontSize: 11,
                    color: DARK_GRAY,
                    width: 'auto'
                  } : {}
                ],
                columnGap: 20
              },
              {
                canvas: [
                  {
                    type: 'line',
                    x1: 0,
                    y1: 10,
                    x2: 515.28,
                    y2: 10,
                    lineWidth: 1,
                    lineColor: THEME_COLOR
                  }
                ]
              }
            ]
          },

          // Sections
          ...sections.map((section, index) => ({
            stack: [
              // Section header
              {
                margin: [0, 20, 0, 0],
                columns: [
                  {
                    canvas: [
                      {
                        type: 'rect',
                        x: 0,
                        y: 0,
                        w: 4,
                        h: 24,
                        color: ACCENT_COLOR
                      }
                    ],
                    width: 4
                  },
                  {
                    text: section.title,
                    fontSize: 16,
                    bold: true,
                    color: ACCENT_COLOR,
                    margin: [10, 0, 0, 0]
                  }
                ]
              },
              // Section content
              {
                stack: section.content.map(line => {
                  if (line.startsWith('*')) {
                    return {
                      margin: [15, 5, 0, 5],
                      columns: [
                        {
                          text: '•',
                          width: 15,
                          color: ACCENT_COLOR,
                          fontSize: 11
                        },
                        {
                          text: line.substring(1).trim(),
                          fontSize: 11,
                          color: '#333333'
                        }
                      ]
                    };
                  }
                  return {
                    text: line,
                    fontSize: 11,
                    lineHeight: 1.4,
                    margin: [0, 8, 0, 8],
                    color: '#333333'
                  };
                }),
                margin: [15, 10, 0, 0]
              },
              // Section separator
              index < sections.length - 1 ? {
                canvas: [
                  {
                    type: 'line',
                    x1: 0,
                    y1: 20,
                    x2: 515.28,
                    y2: 20,
                    lineWidth: 0.5,
                    lineColor: '#e0e0e0'
                  }
                ],
                margin: [0, 10, 0, 10]
              } : {}
            ]
          }))
        ],

        defaultStyle: {
          font: 'Roboto'
        }
      };

      // Create PDF with custom fonts
      const pdf = pdfMake.createPdf(docDefinition, null, fonts);
      pdf.download('health-report.pdf');

    } catch (error) {
      console.error('Error generating PDF:', error);
      setError(`Failed to export PDF: ${error.message}`);
    } finally {
      setIsPdfExporting(false);
    }
  };
  
  const onDismissDatePicker = () => {
    setDatePickerVisible(false);
  };

  const onConfirmDatePicker = ({ startDate: start, endDate: end }) => {
    setDatePickerVisible(false);
    
    // Format dates for the API
    const formatDate = (date) => {
      if (!date) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    setStartDate(start ? formatDate(start) : '');
    setEndDate(end ? formatDate(end) : '');
  };

  const formatDisplayDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Reports</Text>
        <IconButton
          icon="refresh"
          size={24}
          onPress={() => {}}
        />
      </View>

      <ScrollView style={styles.content}>
        {reports.map((report) => (
          <View key={report._id} style={styles.reportCard}>
            <Card>
              <Card.Content>
                <Text style={styles.reportTitle}>{report.title}</Text>
                <Text style={styles.reportDate}>
                  {new Date(report.date).toLocaleDateString()}
                </Text>
                <Text style={styles.reportSummary}>{report.summary}</Text>
              </Card.Content>
            </Card>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.primary,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  reportCard: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.roundness,
    backgroundColor: theme.colors.background,
    ...theme.shadows.medium,
  },
  reportTitle: {
    ...theme.typography.h3,
    color: theme.colors.primary,
  },
  reportDate: {
    ...theme.typography.caption,
    color: theme.colors.disabled,
  },
  reportSummary: {
    ...theme.typography.body2,
    color: theme.colors.text,
  },
});

export default ReportScreen;