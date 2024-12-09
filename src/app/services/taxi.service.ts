import { Injectable } from '@angular/core';
import { taxi, driver } from '../typings';
import { Observable, of } from 'rxjs';
import {HttpClient, HttpHeaders } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class TaxiService {
  private taxiUrl = 'http://localhost:3000/taxi';

  constructor(private http:HttpClient) { }

  getTaxi(): Observable<taxi[]> {
    return this.http.get<taxi[]>(this.taxiUrl);
  }
  deleteTaxi(taxi: taxi): Observable<taxi> {
    const url = `${this.taxiUrl}/${taxi.id}`;
    return this.http.delete<taxi>(url);
  }

}
